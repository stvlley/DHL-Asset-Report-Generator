"""
PBI/SOTI Import service for processing connection status data.
Parses exports from Power BI or SOTI MDM with device connection status.
"""
import re
from typing import Optional, List, Tuple
from datetime import datetime, timezone
import pandas as pd
from sqlalchemy.orm import Session

from app.models.pbi_snapshot import PBISnapshot, PBIDevice
from app.models.app_settings import AppSettings


class PBIImportService:
    """Service for processing PBI/SOTI connection status data."""

    # Patterns to parse connection status text
    CONNECTED_PATTERN = re.compile(r'connected\s+in\s+last\s+(\d+)\s+days?', re.IGNORECASE)
    NOT_CONNECTED_PATTERN = re.compile(r'not\s+connected', re.IGNORECASE)

    def __init__(self, db: Session):
        self.db = db

    def get_inactive_threshold(self) -> int:
        """Get the configured inactive threshold from settings."""
        setting = self.db.query(AppSettings).filter(
            AppSettings.setting_key == "inactive_threshold_days"
        ).first()
        return int(setting.setting_value) if setting else 30

    def process_upload(
        self,
        file_path: str,
        file_name: str,
        site_code: str,
        user_id: Optional[str] = None
    ) -> dict:
        """
        Process a PBI/SOTI connection status file (CSV or Excel).

        Expected columns:
        - SerialNumber or SN: Device serial number
        - Status or ConnectionStatus: Connection status text
        - Model (optional): Device model

        Args:
            file_path: Path to the uploaded file
            file_name: Original file name
            site_code: Site code for this upload
            user_id: ID of user who uploaded

        Returns:
            Dict with processing results
        """
        errors = []
        inactive_threshold = self.get_inactive_threshold()

        try:
            # Read file based on extension
            if file_path.endswith('.csv'):
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to read file: {str(e)}",
                "total_records": 0,
                "connected_count": 0,
                "disconnected_count": 0,
                "errors": [{"error": str(e)}]
            }

        # Normalize column names
        df.columns = df.columns.str.strip()

        # Find serial number column (flexible naming)
        sn_col = None
        for col in df.columns:
            if col.lower() in ['serialnumber', 'serial_number', 'sn', 'serial']:
                sn_col = col
                break

        if not sn_col:
            return {
                "status": "error",
                "message": "Missing serial number column (expected: SerialNumber, SN, or Serial)",
                "total_records": len(df),
                "connected_count": 0,
                "disconnected_count": 0,
                "errors": [{"error": "Missing serial number column"}]
            }

        # Find status column
        status_col = None
        for col in df.columns:
            if col.lower() in ['status', 'connectionstatus', 'connection_status', 'connected']:
                status_col = col
                break

        if not status_col:
            return {
                "status": "error",
                "message": "Missing status column (expected: Status, ConnectionStatus)",
                "total_records": len(df),
                "connected_count": 0,
                "disconnected_count": 0,
                "errors": [{"error": "Missing status column"}]
            }

        # Find model column (optional)
        model_col = None
        for col in df.columns:
            if col.lower() in ['model', 'devicemodel', 'device_model']:
                model_col = col
                break

        # Get current period
        now = datetime.now(timezone.utc)
        period = now.month
        year = now.year

        # Create snapshot
        snapshot = PBISnapshot(
            site_code=site_code,
            period=period,
            year=year,
            file_name=file_name,
            total_records=len(df),
            inactive_threshold_days=inactive_threshold,
            uploaded_by=str(user_id) if user_id else None
        )
        self.db.add(snapshot)
        self.db.flush()

        # Process rows
        connected_count = 0
        disconnected_count = 0
        devices_processed = 0

        for idx, row in df.iterrows():
            try:
                serial = str(row[sn_col]).strip() if pd.notna(row[sn_col]) else None
                if not serial:
                    continue

                status_text = str(row[status_col]).strip() if pd.notna(row[status_col]) else ""
                is_connected, days = self._parse_connection_status(status_text, inactive_threshold)

                model = None
                if model_col and pd.notna(row.get(model_col)):
                    model = str(row[model_col]).strip()

                device = PBIDevice(
                    snapshot_id=snapshot.snapshot_id,
                    serial_number=serial,
                    model=model,
                    connection_status=status_text,
                    is_connected=is_connected,
                    days_since_connect=days
                )
                self.db.add(device)
                devices_processed += 1

                if is_connected:
                    connected_count += 1
                else:
                    disconnected_count += 1

            except Exception as e:
                errors.append({
                    "row": idx + 2,
                    "error": str(e)
                })

        # Update snapshot counts
        snapshot.connected_count = connected_count
        snapshot.disconnected_count = disconnected_count

        self.db.commit()

        return {
            "status": "success",
            "snapshot_id": str(snapshot.snapshot_id),
            "message": f"Processed {devices_processed} devices ({connected_count} connected, {disconnected_count} disconnected)",
            "total_records": len(df),
            "connected_count": connected_count,
            "disconnected_count": disconnected_count,
            "inactive_threshold_days": inactive_threshold,
            "errors": errors
        }

    def _parse_connection_status(
        self,
        status_text: str,
        threshold_days: int
    ) -> Tuple[bool, Optional[int]]:
        """
        Parse connection status text to determine if device is connected.

        Examples:
        - "Connected in last 60 days" -> (True, 60) if threshold >= 60
        - "Not connected in last 60 days" -> (False, None)
        - "Connected" -> (True, 0)

        Returns:
            Tuple of (is_connected, days_since_connect)
        """
        if not status_text:
            return False, None

        # Check for "Not connected" first
        if self.NOT_CONNECTED_PATTERN.search(status_text):
            return False, None

        # Check for "Connected in last X days"
        match = self.CONNECTED_PATTERN.search(status_text)
        if match:
            days = int(match.group(1))
            # Consider connected if within threshold
            is_connected = days <= threshold_days
            return is_connected, days

        # Check for simple "Connected"
        if 'connected' in status_text.lower():
            return True, 0

        return False, None

    def get_snapshots(self, site_code: Optional[str] = None, limit: int = 12) -> List[PBISnapshot]:
        """Get recent PBI snapshots, optionally filtered by site."""
        query = self.db.query(PBISnapshot)

        if site_code:
            query = query.filter(PBISnapshot.site_code == site_code)

        return (
            query.order_by(PBISnapshot.year.desc(), PBISnapshot.period.desc())
            .limit(limit)
            .all()
        )

    def get_latest_snapshot(self, site_code: str) -> Optional[PBISnapshot]:
        """Get the most recent PBI snapshot for a site."""
        return (
            self.db.query(PBISnapshot)
            .filter(PBISnapshot.site_code == site_code)
            .order_by(PBISnapshot.year.desc(), PBISnapshot.period.desc())
            .first()
        )

    def get_inactive_devices(
        self,
        site_code: str,
        threshold_days: Optional[int] = None
    ) -> List[PBIDevice]:
        """
        Get inactive devices from the latest PBI snapshot for a site.

        Args:
            site_code: Site to query
            threshold_days: Override threshold (uses setting if not provided)

        Returns:
            List of inactive PBIDevice records
        """
        snapshot = self.get_latest_snapshot(site_code)
        if not snapshot:
            return []

        threshold = threshold_days or self.get_inactive_threshold()

        return (
            self.db.query(PBIDevice)
            .filter(
                PBIDevice.snapshot_id == snapshot.snapshot_id,
                PBIDevice.is_connected == False
            )
            .all()
        )

    def get_inactive_device_count(
        self,
        site_code: str,
        threshold_days: Optional[int] = None
    ) -> int:
        """Get count of inactive devices for a site."""
        devices = self.get_inactive_devices(site_code, threshold_days)
        return len(devices)

    def add_justification(
        self,
        device_id: int,
        justification: str,
        ticket_number: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Optional[PBIDevice]:
        """
        Add justification for an inactive device.

        Args:
            device_id: ID of the PBI device
            justification: Explanation text
            ticket_number: Related IT ticket (optional)
            user_id: User adding the justification

        Returns:
            Updated PBIDevice or None if not found
        """
        device = self.db.query(PBIDevice).filter(
            PBIDevice.device_id == device_id
        ).first()

        if not device:
            return None

        device.justification = justification
        device.ticket_number = ticket_number
        device.justification_date = datetime.now(timezone.utc)
        device.justified_by = user_id

        self.db.commit()
        return device

    def get_connection_summary(self, site_code: str) -> dict:
        """
        Get connection status summary for a site.

        Returns:
            Dict with totals and breakdown
        """
        snapshot = self.get_latest_snapshot(site_code)
        if not snapshot:
            return {
                "site_code": site_code,
                "has_data": False,
                "total": 0,
                "connected": 0,
                "disconnected": 0,
                "inactive_threshold_days": self.get_inactive_threshold(),
                "snapshot_date": None
            }

        return {
            "site_code": site_code,
            "has_data": True,
            "total": snapshot.total_records,
            "connected": snapshot.connected_count,
            "disconnected": snapshot.disconnected_count,
            "inactive_threshold_days": snapshot.inactive_threshold_days,
            "snapshot_date": snapshot.upload_timestamp.isoformat() if snapshot.upload_timestamp else None,
            "snapshot_id": snapshot.snapshot_id,
            "period": f"{snapshot.period}/{snapshot.year}"
        }
