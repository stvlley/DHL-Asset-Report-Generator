"""
IT Allocation service for processing monthly allocation data.
Extracts RF Hardware/Software devices with HSN, MAC, and GL strings.
"""
import re
from typing import Optional, List, Tuple, Dict, Any
from datetime import datetime, timezone
import pandas as pd
from sqlalchemy.orm import Session

from app.models.it_allocation import ITAllocationSnapshot, ITAllocationDevice, SiteGLMapping
from app.schemas.it_allocation import (
    ITAllocationUploadResponse,
    DeviceLookupResponse,
    GLStringSummary,
)


class ITAllocationService:
    """Service for processing IT Allocation data."""

    # Categories to extract (RF Hardware and Software)
    RF_CATEGORIES = ["RF HARDWARE", "RF SOFTWARE"]

    # Regex patterns for extracting device info
    HSN_PATTERN = re.compile(r'HSN:\s*(\d+)', re.IGNORECASE)
    MAC_PATTERN = re.compile(r'MAC:\s*([a-fA-F0-9]+)', re.IGNORECASE)

    def __init__(self, db: Session):
        self.db = db

    def process_upload(
        self,
        file_path: str,
        file_name: str,
        user_id: Optional[str] = None
    ) -> ITAllocationUploadResponse:
        """
        Process an IT Allocation Excel file and extract RF devices.

        Args:
            file_path: Path to the uploaded Excel file
            file_name: Original file name
            user_id: ID of user who uploaded

        Returns:
            ITAllocationUploadResponse with processing results
        """
        errors = []

        try:
            # Read Excel file
            df = pd.read_excel(file_path)
        except Exception as e:
            return ITAllocationUploadResponse(
                status="error",
                snapshot_id="",
                message=f"Failed to read Excel file: {str(e)}",
                total_records=0,
                rf_hardware_count=0,
                rf_software_count=0,
                unique_devices=0,
                unique_gl_strings=0,
                parsing_errors=[{"error": str(e)}]
            )

        # Extract period and year from data
        period = int(df["Period"].iloc[0]) if "Period" in df.columns else datetime.now().month
        year = int(df["Year"].iloc[0]) if "Year" in df.columns else datetime.now().year

        # Create snapshot
        snapshot = ITAllocationSnapshot(
            period=period,
            year=year,
            file_name=file_name,
            total_records=len(df),
            uploaded_by=user_id
        )
        self.db.add(snapshot)
        self.db.flush()  # Get snapshot_id

        # Filter to RF categories only
        rf_df = df[df["Category"].isin(self.RF_CATEGORIES)]

        rf_hardware_count = 0
        rf_software_count = 0
        devices_added = set()  # Track unique HSN/MAC combinations

        for idx, row in rf_df.iterrows():
            try:
                device = self._parse_device_row(row, snapshot.snapshot_id)
                if device:
                    # Track unique devices
                    device_key = f"{device.hsn}|{device.mac_address}"
                    if device_key not in devices_added:
                        devices_added.add(device_key)

                    self.db.add(device)

                    if row["Category"] == "RF HARDWARE":
                        rf_hardware_count += 1
                    else:
                        rf_software_count += 1

            except Exception as e:
                errors.append({
                    "row": idx + 2,  # Excel row number (1-indexed + header)
                    "error": str(e)
                })

        # Update counts
        snapshot.rf_hardware_count = rf_hardware_count
        snapshot.rf_software_count = rf_software_count

        self.db.commit()

        # Get unique GL strings
        unique_gl = rf_df["GL String"].nunique() if "GL String" in rf_df.columns else 0

        return ITAllocationUploadResponse(
            status="success",
            snapshot_id=snapshot.snapshot_id,
            message=f"Successfully processed {rf_hardware_count + rf_software_count} RF devices",
            total_records=len(df),
            rf_hardware_count=rf_hardware_count,
            rf_software_count=rf_software_count,
            unique_devices=len(devices_added),
            unique_gl_strings=unique_gl,
            parsing_errors=errors
        )

    def _parse_device_row(self, row: pd.Series, snapshot_id: str) -> Optional[ITAllocationDevice]:
        """Parse a single row into an ITAllocationDevice."""
        detail2 = str(row.get("Detail2(PRJ.)", ""))

        # Extract HSN and MAC
        hsn_match = self.HSN_PATTERN.search(detail2)
        mac_match = self.MAC_PATTERN.search(detail2)

        hsn = hsn_match.group(1) if hsn_match else None
        mac = mac_match.group(1) if mac_match else None

        # Skip if no identifiers
        if not hsn and not mac:
            return None

        # Parse GL string components
        gl_string = str(row.get("GL String", ""))
        gl_parts = gl_string.split(".") if gl_string else []

        return ITAllocationDevice(
            snapshot_id=snapshot_id,
            hsn=hsn,
            mac_address=mac,
            device_model=str(row.get("Detail1(UserVendor)", "")).strip(),
            gl_string=gl_string,
            category=str(row.get("Category", "")),
            amount=float(row.get("Amount", 0) or 0),
            gl_company=gl_parts[0] if len(gl_parts) > 0 else None,
            gl_cost_center=gl_parts[1] if len(gl_parts) > 1 else None,
            gl_cost_unit=gl_parts[2] if len(gl_parts) > 2 else None,
            gl_account=gl_parts[3] if len(gl_parts) > 3 else None,
            gl_activity=gl_parts[4] if len(gl_parts) > 4 else None,
            gl_sub_account=gl_parts[5] if len(gl_parts) > 5 else None,
            raw_detail1=str(row.get("Detail1(UserVendor)", "")),
            raw_detail2=detail2
        )

    def lookup_device(self, serial_number: str) -> DeviceLookupResponse:
        """
        Look up a device by serial number (HSN) from the latest allocation snapshot.

        Args:
            serial_number: The HSN to search for

        Returns:
            DeviceLookupResponse with device details if found
        """
        # Get latest snapshot
        latest_snapshot = (
            self.db.query(ITAllocationSnapshot)
            .order_by(ITAllocationSnapshot.year.desc(), ITAllocationSnapshot.period.desc())
            .first()
        )

        if not latest_snapshot:
            return DeviceLookupResponse(found=False)

        # Look up device
        device = (
            self.db.query(ITAllocationDevice)
            .filter(
                ITAllocationDevice.snapshot_id == latest_snapshot.snapshot_id,
                ITAllocationDevice.hsn == serial_number
            )
            .first()
        )

        if not device:
            # Try MAC address lookup
            device = (
                self.db.query(ITAllocationDevice)
                .filter(
                    ITAllocationDevice.snapshot_id == latest_snapshot.snapshot_id,
                    ITAllocationDevice.mac_address == serial_number.replace(":", "").lower()
                )
                .first()
            )

        if not device:
            return DeviceLookupResponse(found=False)

        return DeviceLookupResponse(
            found=True,
            hsn=device.hsn,
            mac_address=device.mac_address,
            device_model=device.device_model,
            gl_string=device.gl_string,
            category=device.category,
            amount=device.amount,
            snapshot_period=f"{latest_snapshot.period}/{latest_snapshot.year}"
        )

    def get_gl_summary(self, snapshot_id: Optional[str] = None) -> List[GLStringSummary]:
        """Get summary of GL strings and device counts."""
        if snapshot_id:
            snapshot = self.db.query(ITAllocationSnapshot).filter(
                ITAllocationSnapshot.snapshot_id == snapshot_id
            ).first()
        else:
            # Get latest
            snapshot = (
                self.db.query(ITAllocationSnapshot)
                .order_by(ITAllocationSnapshot.year.desc(), ITAllocationSnapshot.period.desc())
                .first()
            )

        if not snapshot:
            return []

        # Aggregate by GL string
        from sqlalchemy import func
        results = (
            self.db.query(
                ITAllocationDevice.gl_string,
                ITAllocationDevice.category,
                func.count(ITAllocationDevice.device_id).label("device_count"),
                func.sum(ITAllocationDevice.amount).label("total_amount")
            )
            .filter(ITAllocationDevice.snapshot_id == snapshot.snapshot_id)
            .group_by(ITAllocationDevice.gl_string, ITAllocationDevice.category)
            .all()
        )

        return [
            GLStringSummary(
                gl_string=r.gl_string,
                category=r.category,
                device_count=r.device_count,
                total_amount=r.total_amount or 0
            )
            for r in results
        ]

    def get_snapshots(self, limit: int = 12) -> List[ITAllocationSnapshot]:
        """Get recent IT Allocation snapshots."""
        return (
            self.db.query(ITAllocationSnapshot)
            .order_by(ITAllocationSnapshot.year.desc(), ITAllocationSnapshot.period.desc())
            .limit(limit)
            .all()
        )

    def get_snapshot_devices(
        self,
        snapshot_id: str,
        category: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[ITAllocationDevice]:
        """Get devices from a specific snapshot."""
        query = self.db.query(ITAllocationDevice).filter(
            ITAllocationDevice.snapshot_id == snapshot_id
        )

        if category:
            query = query.filter(ITAllocationDevice.category == category)

        return query.offset(offset).limit(limit).all()

    # Site GL Mapping methods
    def create_site_gl_mapping(
        self,
        site_code: str,
        gl_string: str,
        category: Optional[str] = None,
        is_primary: int = 1,
        notes: Optional[str] = None
    ) -> SiteGLMapping:
        """Create a site to GL string mapping."""
        mapping = SiteGLMapping(
            site_code=site_code,
            gl_string=gl_string,
            category=category,
            is_primary=is_primary,
            notes=notes
        )
        self.db.add(mapping)
        self.db.commit()
        return mapping

    def get_site_gl_mappings(self, site_code: str) -> List[SiteGLMapping]:
        """Get all GL mappings for a site."""
        return (
            self.db.query(SiteGLMapping)
            .filter(SiteGLMapping.site_code == site_code)
            .all()
        )

    def delete_site_gl_mapping(self, mapping_id: int) -> bool:
        """Delete a site GL mapping."""
        mapping = self.db.query(SiteGLMapping).filter(
            SiteGLMapping.mapping_id == mapping_id
        ).first()

        if mapping:
            self.db.delete(mapping)
            self.db.commit()
            return True
        return False

    def validate_site_gl_against_allocation(self, site_code: str) -> Dict[str, Any]:
        """
        Validate a site's GL mappings against the IT Allocation data.
        Returns discrepancies and suggestions.
        """
        mappings = self.get_site_gl_mappings(site_code)
        gl_summary = self.get_gl_summary()

        mapped_gls = {m.gl_string for m in mappings}
        allocation_gls = {s.gl_string for s in gl_summary}

        return {
            "site_code": site_code,
            "mapped_gl_strings": list(mapped_gls),
            "allocation_gl_strings": list(allocation_gls),
            "missing_in_allocation": list(mapped_gls - allocation_gls),
            "available_in_allocation": list(allocation_gls - mapped_gls),
            "valid": len(mapped_gls - allocation_gls) == 0
        }
