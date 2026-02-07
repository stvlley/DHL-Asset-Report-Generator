"""
Master Data Service for building and maintaining the asset master database.
Syncs data from IT Allocation, physical audits, and SOTI MDM.
"""
import json
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from uuid import UUID
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.models.asset import AssetMaster, AssetSource, MDMEnrollmentStatus
from app.models.it_allocation import ITAllocationSnapshot, ITAllocationDevice, SiteGLMapping
from app.models.site import Site


class MasterDataService:
    """Service for managing the asset master database."""

    def __init__(self, db: Session):
        self.db = db

    def sync_from_it_allocation(
        self,
        snapshot_id: str,
        site_code: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sync assets from an IT Allocation snapshot to the AssetMaster.

        Args:
            snapshot_id: The IT Allocation snapshot to sync from
            site_code: Optional - only sync devices for this site (by GL mapping)
            user_id: User performing the sync

        Returns:
            Summary of sync operation
        """
        snapshot = self.db.query(ITAllocationSnapshot).filter(
            ITAllocationSnapshot.snapshot_id == snapshot_id
        ).first()

        if not snapshot:
            raise ValueError(f"Snapshot {snapshot_id} not found")

        # Get devices from snapshot
        query = self.db.query(ITAllocationDevice).filter(
            ITAllocationDevice.snapshot_id == snapshot_id
        )

        # If site_code specified, filter by GL mappings
        site_gls = set()
        if site_code:
            mappings = self.db.query(SiteGLMapping).filter(
                SiteGLMapping.site_code == site_code
            ).all()
            site_gls = {m.gl_string for m in mappings}
            if site_gls:
                query = query.filter(ITAllocationDevice.gl_string.in_(site_gls))

        devices = query.all()

        stats = {
            "total_devices": len(devices),
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "errors": []
        }

        for device in devices:
            try:
                result = self._sync_device_to_master(device, site_code, user_id, snapshot_id)
                stats[result] += 1
            except Exception as e:
                stats["errors"].append({
                    "hsn": device.hsn,
                    "mac": device.mac_address,
                    "error": str(e)
                })

        self.db.commit()
        return stats

    def _sync_device_to_master(
        self,
        device: ITAllocationDevice,
        site_code: Optional[str],
        user_id: Optional[str],
        snapshot_id: str
    ) -> str:
        """Sync a single device to AssetMaster. Returns 'created', 'updated', or 'skipped'."""
        # Determine site from GL string if not specified
        if not site_code:
            mapping = self.db.query(SiteGLMapping).filter(
                SiteGLMapping.gl_string == device.gl_string
            ).first()
            site_code = mapping.site_code if mapping else None

        if not site_code:
            return "skipped"  # Can't determine site

        # Use HSN as serial number, fall back to MAC
        serial = device.hsn or device.mac_address
        if not serial:
            return "skipped"  # No identifier

        # Check if asset exists
        existing = self.db.query(AssetMaster).filter(
            AssetMaster.serial_number == serial,
            AssetMaster.assigned_site_code == site_code,
            AssetMaster.is_deleted == False
        ).first()

        # Determine asset type from category
        asset_type = self._category_to_asset_type(device.category)

        if existing:
            # Update existing
            existing.hsn = device.hsn
            existing.mac_address = device.mac_address
            existing.model = device.device_model or existing.model
            existing.gl_string = device.gl_string
            existing.cost_per_month = Decimal(str(device.amount)) if device.amount else existing.cost_per_month
            existing.it_allocation_snapshot_id = snapshot_id
            existing.updated_at = datetime.now(timezone.utc)
            existing.updated_by = user_id
            return "updated"
        else:
            # Create new
            new_asset = AssetMaster(
                serial_number=serial,
                assigned_site_code=site_code,
                hsn=device.hsn,
                mac_address=device.mac_address,
                asset_type=asset_type,
                model=device.device_model or "Unknown",
                gl_string=device.gl_string,
                cost_per_month=Decimal(str(device.amount)) if device.amount else None,
                source=AssetSource.IT_ALLOCATION.value,
                it_allocation_snapshot_id=snapshot_id,
                updated_by=user_id
            )
            self.db.add(new_asset)
            return "created"

    def _category_to_asset_type(self, category: str) -> str:
        """Convert IT Allocation category to asset type."""
        cat_upper = (category or "").upper().replace(" ", "").replace("-", "")
        if "RFHARDWARE" in cat_upper:
            return "RF Scanner"
        elif "RFSOFTWARE" in cat_upper:
            return "RF Software License"
        elif "TABLET" in cat_upper:
            return "Tablet"
        elif "PRINTER" in cat_upper:
            return "Printer"
        elif "LAPTOP" in cat_upper or "NOTEBOOK" in cat_upper:
            return "Laptop"
        else:
            return category or "Unknown"

    def get_yearly_allocation_summary(
        self,
        year: int,
        site_code: Optional[str] = None,
        gl_string: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get yearly aggregated costs from IT Allocation data.

        Args:
            year: The year to aggregate
            site_code: Optional filter by site
            gl_string: Optional filter by GL string

        Returns:
            Yearly summary with monthly breakdown
        """
        # Get all snapshots for the year
        snapshots = self.db.query(ITAllocationSnapshot).filter(
            ITAllocationSnapshot.year == year
        ).order_by(ITAllocationSnapshot.period).all()

        snapshot_ids = [s.snapshot_id for s in snapshots]

        if not snapshot_ids:
            return {
                "year": year,
                "total_annual_cost": 0,
                "monthly_breakdown": [],
                "by_category": {},
                "by_gl_string": {}
            }

        # Build device query
        query = self.db.query(ITAllocationDevice).filter(
            ITAllocationDevice.snapshot_id.in_(snapshot_ids)
        )

        if gl_string:
            query = query.filter(ITAllocationDevice.gl_string == gl_string)
        elif site_code:
            # Get GL strings for site
            mappings = self.db.query(SiteGLMapping).filter(
                SiteGLMapping.site_code == site_code
            ).all()
            site_gls = [m.gl_string for m in mappings]
            if site_gls:
                query = query.filter(ITAllocationDevice.gl_string.in_(site_gls))

        # Aggregate by snapshot (month)
        monthly_data = {}
        category_totals = {}
        gl_totals = {}

        for snapshot in snapshots:
            month_key = f"{snapshot.year}-{snapshot.period:02d}"
            devices = query.filter(
                ITAllocationDevice.snapshot_id == snapshot.snapshot_id
            ).all()

            month_total = sum(d.amount or 0 for d in devices)
            monthly_data[month_key] = {
                "period": snapshot.period,
                "year": snapshot.year,
                "total": float(month_total),
                "device_count": len(devices)
            }

            for d in devices:
                cat = d.category or "Unknown"
                category_totals[cat] = category_totals.get(cat, 0) + (d.amount or 0)
                gl_totals[d.gl_string] = gl_totals.get(d.gl_string, 0) + (d.amount or 0)

        total_annual = sum(m["total"] for m in monthly_data.values())

        return {
            "year": year,
            "total_annual_cost": float(total_annual),
            "average_monthly_cost": float(total_annual / 12) if total_annual else 0,
            "monthly_breakdown": [
                {"month": k, **v} for k, v in sorted(monthly_data.items())
            ],
            "by_category": {k: float(v) for k, v in sorted(category_totals.items(), key=lambda x: -x[1])},
            "by_gl_string": {k: float(v) for k, v in sorted(gl_totals.items(), key=lambda x: -x[1])[:20]}  # Top 20
        }

    def get_master_assets(
        self,
        site_code: Optional[str] = None,
        asset_type: Optional[str] = None,
        mdm_status: Optional[str] = None,
        search: Optional[str] = None,
        include_deleted: bool = False,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[List[AssetMaster], int]:
        """
        Get assets from master database with filtering.

        Returns:
            Tuple of (assets list, total count)
        """
        query = self.db.query(AssetMaster)

        if not include_deleted:
            query = query.filter(AssetMaster.is_deleted == False)

        if site_code:
            query = query.filter(AssetMaster.assigned_site_code == site_code)

        if asset_type:
            query = query.filter(AssetMaster.asset_type == asset_type)

        if mdm_status:
            query = query.filter(AssetMaster.mdm_enrollment_status == mdm_status)

        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    AssetMaster.serial_number.ilike(search_pattern),
                    AssetMaster.hsn.ilike(search_pattern),
                    AssetMaster.mac_address.ilike(search_pattern),
                    AssetMaster.model.ilike(search_pattern),
                    AssetMaster.mdm_device_name.ilike(search_pattern)
                )
            )

        total = query.count()
        assets = query.order_by(
            AssetMaster.assigned_site_code,
            AssetMaster.serial_number
        ).offset(offset).limit(limit).all()

        return assets, total

    def update_asset(
        self,
        asset_id: str,
        updates: Dict[str, Any],
        user_id: Optional[str] = None
    ) -> AssetMaster:
        """Update an asset in the master database."""
        asset = self.db.query(AssetMaster).filter(
            AssetMaster.asset_id == asset_id
        ).first()

        if not asset:
            raise ValueError(f"Asset {asset_id} not found")

        # List of editable fields
        editable_fields = [
            "serial_number", "assigned_site_code", "hsn", "mac_address",
            "imei", "asset_type", "model", "manufacturer", "gl_string",
            "recorded_condition", "cost_per_month", "notes"
        ]

        for field, value in updates.items():
            if field in editable_fields:
                # Track site transfers
                if field == "assigned_site_code" and value != asset.assigned_site_code:
                    asset.previous_site_code = asset.assigned_site_code
                    asset.transfer_date = datetime.now(timezone.utc)

                setattr(asset, field, value)

        asset.updated_at = datetime.now(timezone.utc)
        asset.updated_by = user_id
        asset.source = AssetSource.MANUAL.value  # Mark as manually edited

        self.db.commit()
        self.db.refresh(asset)
        return asset

    def create_asset(
        self,
        data: Dict[str, Any],
        user_id: Optional[str] = None
    ) -> AssetMaster:
        """Create a new asset in the master database."""
        required = ["serial_number", "assigned_site_code", "asset_type", "model", "gl_string"]
        for field in required:
            if field not in data or not data[field]:
                raise ValueError(f"Missing required field: {field}")

        # Check for duplicate
        existing = self.db.query(AssetMaster).filter(
            AssetMaster.serial_number == data["serial_number"],
            AssetMaster.assigned_site_code == data["assigned_site_code"],
            AssetMaster.is_deleted == False
        ).first()

        if existing:
            raise ValueError(f"Asset with serial {data['serial_number']} already exists at site {data['assigned_site_code']}")

        asset = AssetMaster(
            serial_number=data["serial_number"],
            assigned_site_code=data["assigned_site_code"],
            hsn=data.get("hsn"),
            mac_address=data.get("mac_address"),
            imei=data.get("imei"),
            asset_type=data["asset_type"],
            model=data["model"],
            manufacturer=data.get("manufacturer"),
            gl_string=data["gl_string"],
            recorded_condition=data.get("recorded_condition", "Good"),
            cost_per_month=Decimal(str(data["cost_per_month"])) if data.get("cost_per_month") else None,
            source=AssetSource.MANUAL.value,
            notes=data.get("notes"),
            updated_by=user_id
        )

        self.db.add(asset)
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def delete_asset(
        self,
        asset_id: str,
        user_id: Optional[str] = None,
        hard_delete: bool = False
    ) -> bool:
        """Delete an asset (soft delete by default)."""
        asset = self.db.query(AssetMaster).filter(
            AssetMaster.asset_id == asset_id
        ).first()

        if not asset:
            return False

        if hard_delete:
            self.db.delete(asset)
        else:
            asset.is_deleted = True
            asset.deleted_at = datetime.now(timezone.utc)
            asset.deleted_by = user_id

        self.db.commit()
        return True

    def transfer_asset(
        self,
        asset_id: str,
        new_site_code: str,
        new_gl_string: Optional[str] = None,
        notes: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> AssetMaster:
        """Transfer an asset to a new site."""
        asset = self.db.query(AssetMaster).filter(
            AssetMaster.asset_id == asset_id
        ).first()

        if not asset:
            raise ValueError(f"Asset {asset_id} not found")

        # Verify new site exists
        new_site = self.db.query(Site).filter(Site.site_code == new_site_code).first()
        if not new_site:
            raise ValueError(f"Site {new_site_code} not found")

        # Record transfer
        asset.previous_site_code = asset.assigned_site_code
        asset.assigned_site_code = new_site_code
        asset.transfer_date = datetime.now(timezone.utc)
        asset.transfer_notes = notes

        if new_gl_string:
            asset.gl_string = new_gl_string

        asset.updated_at = datetime.now(timezone.utc)
        asset.updated_by = user_id

        self.db.commit()
        self.db.refresh(asset)
        return asset

    def get_mdm_disconnected_devices(
        self,
        site_code: Optional[str] = None,
        days_threshold: int = 30
    ) -> List[AssetMaster]:
        """Get devices that haven't connected to MDM in X days."""
        query = self.db.query(AssetMaster).filter(
            AssetMaster.is_deleted == False,
            AssetMaster.mdm_enrollment_status == MDMEnrollmentStatus.ENROLLED.value,
            AssetMaster.mdm_days_since_connect >= days_threshold
        )

        if site_code:
            query = query.filter(AssetMaster.assigned_site_code == site_code)

        return query.order_by(AssetMaster.mdm_days_since_connect.desc()).all()

    def upload_mdm_status(
        self,
        file_path: str,
        site_code: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload MDM/SOTI connection status from a simple file.

        Expects CSV or Excel with columns:
        - Serial Number (or SN, Serial, Device ID)
        - Status (or Connection Status, MDM Status)
        - Model (optional)

        Args:
            file_path: Path to the uploaded file
            site_code: Optional filter to only update assets at this site
            user_id: User performing the upload

        Returns:
            Upload statistics
        """
        import pandas as pd

        # Read file
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)

        # Normalize column names
        df.columns = df.columns.str.strip().str.lower()

        # Find serial number column
        serial_col = None
        for col in ['serial number', 'sn', 'serial', 'device id', 'serialnumber', 'hsn']:
            if col in df.columns:
                serial_col = col
                break

        if not serial_col:
            raise ValueError("Could not find serial number column. Expected: Serial Number, SN, Serial, or Device ID")

        # Find status column
        status_col = None
        for col in ['status', 'connection status', 'mdm status', 'connectionstatus', 'mdmstatus']:
            if col in df.columns:
                status_col = col
                break

        if not status_col:
            raise ValueError("Could not find status column. Expected: Status, Connection Status, or MDM Status")

        stats = {
            "total_rows": len(df),
            "matched": 0,
            "unmatched": 0,
            "connected": 0,
            "disconnected": 0,
            "errors": []
        }

        for idx, row in df.iterrows():
            try:
                serial = str(row[serial_col]).strip()
                if not serial or serial == 'nan' or serial.lower() == serial_col:
                    continue

                status_raw = str(row[status_col]).strip().lower()

                # Determine connection status
                is_connected = (
                    'connected in last' in status_raw or
                    status_raw == 'connected' or
                    status_raw == 'online' or
                    status_raw == 'active'
                ) and 'not connected' not in status_raw

                # Find matching asset
                query = self.db.query(AssetMaster).filter(
                    AssetMaster.is_deleted == False,
                    or_(
                        AssetMaster.serial_number == serial,
                        AssetMaster.hsn == serial
                    )
                )

                if site_code:
                    query = query.filter(AssetMaster.assigned_site_code == site_code)

                asset = query.first()

                if asset:
                    asset.mdm_enrollment_status = MDMEnrollmentStatus.ENROLLED.value
                    asset.mdm_days_since_connect = 0 if is_connected else 60
                    asset.mdm_last_sync = datetime.now(timezone.utc)
                    asset.updated_at = datetime.now(timezone.utc)
                    asset.updated_by = user_id

                    stats["matched"] += 1
                    if is_connected:
                        stats["connected"] += 1
                    else:
                        stats["disconnected"] += 1
                else:
                    stats["unmatched"] += 1

            except Exception as e:
                stats["errors"].append({"row": idx + 2, "error": str(e)})

        self.db.commit()
        return stats

    def get_reconciliation_summary(self, site_code: str) -> Dict[str, Any]:
        """Get reconciliation summary showing data coverage across sources."""
        assets = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == site_code,
            AssetMaster.is_deleted == False
        ).all()

        total = len(assets)
        with_billing = sum(1 for a in assets if a.cost_per_month and float(a.cost_per_month) > 0)
        with_mdm = sum(1 for a in assets if a.mdm_enrollment_status != MDMEnrollmentStatus.UNKNOWN.value)
        disconnected_60 = sum(1 for a in assets if a.mdm_days_since_connect and a.mdm_days_since_connect >= 60)

        monthly_cost = sum(float(a.cost_per_month or 0) for a in assets)

        by_condition = {}
        for a in assets:
            cond = a.recorded_condition or "Unknown"
            by_condition[cond] = by_condition.get(cond, 0) + 1

        by_type = {}
        for a in assets:
            atype = a.asset_type or "Unknown"
            by_type[atype] = by_type.get(atype, 0) + 1

        return {
            "site_code": site_code,
            "total_assets": total,
            "with_billing_data": with_billing,
            "without_billing_data": total - with_billing,
            "with_mdm_status": with_mdm,
            "without_mdm_status": total - with_mdm,
            "mdm_disconnected_60_days": disconnected_60,
            "total_monthly_cost": round(monthly_cost, 2),
            "total_annual_cost": round(monthly_cost * 12, 2),
            "by_condition": by_condition,
            "by_asset_type": by_type
        }

    def get_master_stats(self, site_code: Optional[str] = None) -> Dict[str, Any]:
        """Get summary statistics for master data."""
        query = self.db.query(AssetMaster).filter(AssetMaster.is_deleted == False)

        if site_code:
            query = query.filter(AssetMaster.assigned_site_code == site_code)

        total = query.count()

        # By asset type
        by_type = self.db.query(
            AssetMaster.asset_type,
            func.count(AssetMaster.asset_id)
        ).filter(AssetMaster.is_deleted == False)
        if site_code:
            by_type = by_type.filter(AssetMaster.assigned_site_code == site_code)
        by_type = dict(by_type.group_by(AssetMaster.asset_type).all())

        # By MDM status
        by_mdm = self.db.query(
            AssetMaster.mdm_enrollment_status,
            func.count(AssetMaster.asset_id)
        ).filter(AssetMaster.is_deleted == False)
        if site_code:
            by_mdm = by_mdm.filter(AssetMaster.assigned_site_code == site_code)
        by_mdm = dict(by_mdm.group_by(AssetMaster.mdm_enrollment_status).all())

        # Total monthly cost
        total_cost = query.with_entities(
            func.sum(AssetMaster.cost_per_month)
        ).scalar() or 0

        # Disconnected devices (30+ days)
        disconnected = query.filter(
            AssetMaster.mdm_days_since_connect >= 30
        ).count()

        return {
            "total_assets": total,
            "by_asset_type": by_type,
            "by_mdm_status": by_mdm,
            "total_monthly_cost": float(total_cost),
            "total_annual_cost": float(total_cost * 12),
            "mdm_disconnected_30_days": disconnected
        }
