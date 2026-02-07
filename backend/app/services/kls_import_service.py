"""
KLS Asset Audit Import Service.
Handles importing the multi-sheet Excel audit workbook format.
"""
import re
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
from decimal import Decimal
import pandas as pd
from sqlalchemy.orm import Session

from app.models.asset import AssetMaster, AssetSource, MDMEnrollmentStatus
from app.models.site import Site


class KLSImportService:
    """
    Service for importing KLS-style multi-sheet asset audit workbooks.

    Expected sheets:
    - Asset Detail: Master list with Serial, Model, Site, Condition, Status
    - IT Allocation Import: Monthly billing with GL, costs, HSN/MAC
    - PBI Import: SOTI connection status (Connected/Not connected in 60 days)
    - Scan Audit: Physical scan results
    """

    def __init__(self, db: Session):
        self.db = db

    def import_workbook(
        self,
        file_path: str,
        site_code: str,
        gl_string: str,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Import a complete KLS asset audit workbook.

        Args:
            file_path: Path to the Excel workbook
            site_code: Site code to assign devices to
            gl_string: Default GL string for devices
            user_id: User performing the import

        Returns:
            Import statistics
        """
        xlsx = pd.ExcelFile(file_path)

        stats = {
            "asset_detail": {"imported": 0, "updated": 0, "errors": []},
            "it_allocation": {"matched": 0, "unmatched": 0},
            "pbi_import": {"matched": 0, "unmatched": 0, "connected": 0, "disconnected": 0},
            "scan_audit": {"total_scans": 0, "found": 0, "not_in_system": 0},
        }

        # 1. Import Asset Detail as master
        if "Asset Detail" in xlsx.sheet_names:
            stats["asset_detail"] = self._import_asset_detail(
                xlsx, site_code, gl_string, user_id
            )
            self.db.commit()  # Commit so we can match in subsequent phases

        # 2. Sync IT Allocation costs
        if "IT Allocation Import" in xlsx.sheet_names:
            stats["it_allocation"] = self._sync_it_allocation(xlsx)
            self.db.commit()

        # 3. Sync PBI/SOTI connection status
        if "PBI Import" in xlsx.sheet_names:
            stats["pbi_import"] = self._sync_pbi_status(xlsx)
            self.db.commit()

        # 4. Process Scan Audit
        if "Scan Audit" in xlsx.sheet_names:
            stats["scan_audit"] = self._process_scan_audit(xlsx)

        self.db.commit()
        return stats

    def _import_asset_detail(
        self,
        xlsx: pd.ExcelFile,
        site_code: str,
        default_gl: str,
        user_id: Optional[str]
    ) -> Dict[str, Any]:
        """Import Asset Detail sheet as master data."""
        df = pd.read_excel(xlsx, sheet_name="Asset Detail")

        stats = {"imported": 0, "updated": 0, "skipped": 0, "errors": []}

        for idx, row in df.iterrows():
            try:
                serial = str(row.get("Serial Number", "")).strip()
                if not serial or serial == "nan":
                    continue

                # Check if exists
                existing = self.db.query(AssetMaster).filter(
                    AssetMaster.serial_number == serial,
                    AssetMaster.assigned_site_code == site_code,
                    AssetMaster.is_deleted == False
                ).first()

                # Parse condition
                condition = str(row.get("Condition", "")).strip().upper()
                if condition == "G":
                    condition = "Good"
                elif condition == "B":
                    condition = "Bad"

                # Parse status for RMA/Lost
                status = str(row.get("Status", "")).strip().upper() if pd.notna(row.get("Status")) else None

                # Get model
                model = str(row.get("Model", "Unknown")).strip() if pd.notna(row.get("Model")) else "Unknown"

                # Get GL from row or use default
                gl = str(row.get("GL", "")).strip() if pd.notna(row.get("GL")) else default_gl

                if existing:
                    # Update existing
                    existing.model = model if model != "Unknown" else existing.model
                    existing.recorded_condition = condition or existing.recorded_condition
                    if gl:
                        existing.gl_string = gl
                    existing.updated_at = datetime.now(timezone.utc)
                    existing.updated_by = user_id

                    # Track RMA/Lost status in notes
                    if status in ["RMA", "LOST"]:
                        existing.notes = f"Status: {status}" + (f" - {existing.notes}" if existing.notes else "")

                    stats["updated"] += 1
                else:
                    # Create new
                    asset = AssetMaster(
                        serial_number=serial,
                        assigned_site_code=site_code,
                        asset_type=self._model_to_type(model),
                        model=model,
                        gl_string=gl or default_gl,
                        recorded_condition=condition or "Good",
                        source=AssetSource.MANUAL.value,
                        notes=f"Status: {status}" if status in ["RMA", "LOST"] else None,
                        updated_by=user_id
                    )
                    self.db.add(asset)
                    stats["imported"] += 1

            except Exception as e:
                stats["errors"].append({"row": idx + 2, "error": str(e)})

        return stats

    def _sync_it_allocation(self, xlsx: pd.ExcelFile) -> Dict[str, Any]:
        """Sync IT Allocation costs to master data."""
        df = pd.read_excel(xlsx, sheet_name="IT Allocation Import", header=1)

        stats = {"matched": 0, "unmatched": 0, "total_monthly_cost": 0}

        for idx, row in df.iterrows():
            try:
                # Get serial from the sheet (it's called "Serial Number" in the header)
                serial = str(row.get("Serial Number", "")).strip()
                if not serial or serial == "nan":
                    continue

                # Parse Detail2 for HSN and MAC
                detail2 = str(row.get("Detail2(PRJ.)", "")) if pd.notna(row.get("Detail2(PRJ.)")) else ""
                hsn_match = re.search(r'HSN:\s*(\d+)', detail2, re.IGNORECASE)
                mac_match = re.search(r'MAC:\s*([a-fA-F0-9]+)', detail2, re.IGNORECASE)

                hsn = hsn_match.group(1) if hsn_match else serial
                mac = mac_match.group(1) if mac_match else None

                # Get monthly cost - use most recent non-zero value
                # Try current Amount first, then historical columns
                monthly_cost = float(row.get("Amount", 0) or 0)

                if monthly_cost == 0:
                    # Check historical columns for most recent cost
                    for col in ["1MthAgo", "2MthAgo", "3MthAgo", "4MthAgo"]:
                        if col in row and pd.notna(row[col]) and float(row[col] or 0) > 0:
                            monthly_cost = float(row[col])
                            break

                # Find matching asset by serial or HSN
                asset = self.db.query(AssetMaster).filter(
                    AssetMaster.is_deleted == False,
                    (AssetMaster.serial_number == serial) |
                    (AssetMaster.serial_number == hsn) |
                    (AssetMaster.hsn == hsn)
                ).first()

                if asset:
                    asset.hsn = hsn
                    asset.mac_address = mac
                    asset.cost_per_month = Decimal(str(monthly_cost)) if monthly_cost else asset.cost_per_month
                    asset.gl_string = str(row.get("GL String", asset.gl_string))

                    # Update model from Detail1 if available
                    detail1 = str(row.get("Detail1(UserVendor)", "")).strip()
                    if detail1 and detail1 != "nan":
                        asset.model = detail1

                    stats["matched"] += 1
                    stats["total_monthly_cost"] += monthly_cost
                else:
                    stats["unmatched"] += 1

            except Exception as e:
                continue  # Skip errors silently for bulk import

        return stats

    def _sync_pbi_status(self, xlsx: pd.ExcelFile) -> Dict[str, Any]:
        """Sync SOTI/PBI connection status."""
        df = pd.read_excel(xlsx, sheet_name="PBI Import", header=6)  # Data starts at row 7

        # Rename columns based on the format we saw
        if len(df.columns) >= 2:
            df.columns = ["SN", "Status", "Model", "Justification", "Ticket"][:len(df.columns)]

        stats = {"matched": 0, "unmatched": 0, "connected": 0, "disconnected": 0}

        for idx, row in df.iterrows():
            try:
                serial = str(row.get("SN", "")).strip()
                if not serial or serial == "nan" or serial == "SN":
                    continue

                status = str(row.get("Status", "")).strip().lower()
                is_connected = "connected in last" in status and "not connected" not in status

                # Find matching asset
                asset = self.db.query(AssetMaster).filter(
                    AssetMaster.is_deleted == False,
                    (AssetMaster.serial_number == serial) |
                    (AssetMaster.hsn == serial)
                ).first()

                if asset:
                    if is_connected:
                        asset.mdm_enrollment_status = MDMEnrollmentStatus.ENROLLED.value
                        asset.mdm_days_since_connect = 0  # Connected recently
                        stats["connected"] += 1
                    else:
                        asset.mdm_enrollment_status = MDMEnrollmentStatus.ENROLLED.value
                        asset.mdm_days_since_connect = 60  # Not connected in 60 days
                        stats["disconnected"] += 1

                    asset.mdm_last_sync = datetime.now(timezone.utc)
                    stats["matched"] += 1
                else:
                    stats["unmatched"] += 1

            except Exception as e:
                continue

        return stats

    def _process_scan_audit(self, xlsx: pd.ExcelFile) -> Dict[str, Any]:
        """Process Scan Audit sheet for statistics."""
        df = pd.read_excel(xlsx, sheet_name="Scan Audit", header=5)  # Data starts at row 6

        stats = {"total_scans": 0, "found": 0, "not_in_system": 0}

        for idx, row in df.iterrows():
            try:
                serial = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""
                if not serial or serial == "nan" or serial == "Serial Number":
                    continue

                stats["total_scans"] += 1

                # Check match status (column 4)
                match_status = str(row.iloc[4]).strip() if len(row) > 4 and pd.notna(row.iloc[4]) else ""

                if "Found" in match_status or "✓" in match_status:
                    stats["found"] += 1
                elif "Not" in match_status:
                    stats["not_in_system"] += 1

            except Exception as e:
                continue

        return stats

    def _model_to_type(self, model: str) -> str:
        """Convert model name to asset type."""
        model_upper = model.upper()

        if any(x in model_upper for x in ["TC", "MC", "DS", "WT", "RS"]):
            return "RF Scanner"
        elif "VOCOLLECT" in model_upper or "VOICE" in model_upper:
            return "Voice Terminal"
        elif any(x in model_upper for x in ["ET", "L10", "TAB"]):
            return "Tablet"
        elif "SM-" in model_upper:
            return "Tablet"
        elif "ZQ" in model_upper or "PRINT" in model_upper:
            return "Printer"
        else:
            return "RF Scanner"  # Default

    def get_reconciliation_summary(self, site_code: str) -> Dict[str, Any]:
        """Get reconciliation summary for a site."""
        assets = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == site_code,
            AssetMaster.is_deleted == False
        ).all()

        total = len(assets)
        with_cost = sum(1 for a in assets if a.cost_per_month and a.cost_per_month > 0)
        with_mdm = sum(1 for a in assets if a.mdm_enrollment_status != MDMEnrollmentStatus.UNKNOWN.value)
        disconnected = sum(1 for a in assets if a.mdm_days_since_connect and a.mdm_days_since_connect >= 60)

        total_monthly = sum(float(a.cost_per_month or 0) for a in assets)

        # Count by condition
        by_condition = {}
        for a in assets:
            cond = a.recorded_condition or "Unknown"
            by_condition[cond] = by_condition.get(cond, 0) + 1

        return {
            "site_code": site_code,
            "total_assets": total,
            "with_billing_data": with_cost,
            "without_billing_data": total - with_cost,
            "with_mdm_status": with_mdm,
            "without_mdm_status": total - with_mdm,
            "mdm_disconnected_60_days": disconnected,
            "total_monthly_cost": round(total_monthly, 2),
            "total_annual_cost": round(total_monthly * 12, 2),
            "by_condition": by_condition
        }
