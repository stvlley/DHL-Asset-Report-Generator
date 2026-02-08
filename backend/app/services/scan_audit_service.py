"""
Scan Audit Service for real-time physical inventory scanning.

Handles:
- Starting/stopping scan sessions
- Looking up scanned barcodes/serials
- Recording scans with condition
- Tracking missing (not yet scanned) assets
"""
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models.scan_audit import ScanSession, ScanResult, ScanStatus
from app.models.asset import AssetMaster


class ScanAuditService:
    """Service for physical audit scanning workflow."""

    def __init__(self, db: Session):
        self.db = db

    def start_session(
        self,
        site_code: str,
        auditor_name: Optional[str] = None,
        auditor_user_id: Optional[str] = None,
        session_name: Optional[str] = None
    ) -> ScanSession:
        """
        Start a new scan session for a site.

        Closes any existing active sessions for the site.
        """
        # Close existing active sessions
        self.db.query(ScanSession).filter(
            ScanSession.site_code == site_code,
            ScanSession.is_active == True
        ).update({"is_active": False, "completed_at": datetime.now(timezone.utc)})

        # Get expected count from master data
        expected = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == site_code,
            AssetMaster.is_deleted == False
        ).count()

        # Create new session
        session = ScanSession(
            site_code=site_code,
            session_name=session_name or f"Audit {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            auditor_name=auditor_name,
            auditor_user_id=auditor_user_id,
            expected_count=expected
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_active_session(self, site_code: str) -> Optional[ScanSession]:
        """Get the active scan session for a site."""
        return self.db.query(ScanSession).filter(
            ScanSession.site_code == site_code,
            ScanSession.is_active == True
        ).first()

    def end_session(self, session_id: str) -> ScanSession:
        """End a scan session."""
        session = self.db.query(ScanSession).filter(
            ScanSession.session_id == session_id
        ).first()

        if session:
            session.is_active = False
            session.completed_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(session)

        return session

    def lookup_scan(
        self,
        session_id: str,
        scanned_value: str
    ) -> Dict[str, Any]:
        """
        Look up a scanned barcode/serial number.

        Returns asset info if found, or not_tracked status.
        Does NOT record the scan yet - that happens on condition confirm.
        """
        session = self.db.query(ScanSession).filter(
            ScanSession.session_id == session_id
        ).first()

        if not session:
            raise ValueError("Session not found")

        scanned_value = scanned_value.strip()

        # Check if already scanned in this session
        existing = self.db.query(ScanResult).filter(
            ScanResult.session_id == session_id,
            ScanResult.scanned_value == scanned_value
        ).first()

        if existing:
            return {
                "status": "duplicate",
                "message": "Already scanned in this session",
                "scanned_at": existing.scanned_at.isoformat(),
                "recorded_condition": existing.recorded_condition,
                "result_id": existing.result_id
            }

        # Look up in master data
        asset = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == session.site_code,
            AssetMaster.is_deleted == False,
            or_(
                AssetMaster.serial_number == scanned_value,
                AssetMaster.hsn == scanned_value,
                AssetMaster.mac_address == scanned_value
            )
        ).first()

        if asset:
            return {
                "status": "found",
                "asset_id": asset.asset_id,
                "serial_number": asset.serial_number,
                "hsn": asset.hsn,
                "model": asset.model,
                "asset_type": asset.asset_type,
                "current_condition": asset.recorded_condition,
                "gl_string": asset.gl_string,
                "cost_per_month": float(asset.cost_per_month) if asset.cost_per_month else None,
                "mdm_status": asset.mdm_enrollment_status,
                "mdm_days_since_connect": asset.mdm_days_since_connect
            }
        else:
            return {
                "status": "not_tracked",
                "message": "Asset not found in master data for this site",
                "scanned_value": scanned_value
            }

    def record_scan(
        self,
        session_id: str,
        scanned_value: str,
        condition: str,  # "G" or "B" or "Good" or "Bad"
        location: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record a scan with condition confirmation.

        This is called after lookup when user confirms condition.
        """
        session = self.db.query(ScanSession).filter(
            ScanSession.session_id == session_id
        ).first()

        if not session:
            raise ValueError("Session not found")

        if not session.is_active:
            raise ValueError("Session is no longer active")

        scanned_value = scanned_value.strip()

        # Normalize condition
        condition = condition.upper().strip()
        if condition in ["G", "GOOD"]:
            condition = "Good"
        elif condition in ["B", "BAD"]:
            condition = "Bad"

        # Check for duplicate
        existing = self.db.query(ScanResult).filter(
            ScanResult.session_id == session_id,
            ScanResult.scanned_value == scanned_value
        ).first()

        if existing:
            # Update existing scan
            existing.recorded_condition = condition
            existing.condition_confirmed_at = datetime.now(timezone.utc)
            existing.location = location
            existing.notes = notes
            self.db.commit()
            return {
                "status": "updated",
                "result_id": existing.result_id,
                "message": "Scan updated with new condition"
            }

        # Look up asset
        asset = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == session.site_code,
            AssetMaster.is_deleted == False,
            or_(
                AssetMaster.serial_number == scanned_value,
                AssetMaster.hsn == scanned_value,
                AssetMaster.mac_address == scanned_value
            )
        ).first()

        # Create scan result
        result = ScanResult(
            session_id=session_id,
            scanned_value=scanned_value,
            scan_status=ScanStatus.FOUND.value if asset else ScanStatus.NOT_TRACKED.value,
            asset_id=asset.asset_id if asset else None,
            master_serial=asset.serial_number if asset else None,
            master_model=asset.model if asset else None,
            master_asset_type=asset.asset_type if asset else None,
            master_condition=asset.recorded_condition if asset else None,
            recorded_condition=condition,
            condition_confirmed_at=datetime.now(timezone.utc),
            location=location,
            notes=notes
        )
        self.db.add(result)

        # Update session stats
        session.total_scanned += 1
        if asset:
            session.found_count += 1
        else:
            session.not_tracked_count += 1

        if condition == "Good":
            session.good_count += 1
        elif condition == "Bad":
            session.bad_count += 1

        # Update asset condition in master if found
        if asset:
            asset.recorded_condition = condition
            asset.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(result)

        return {
            "status": "recorded",
            "result_id": result.result_id,
            "scan_status": result.scan_status,
            "recorded_condition": condition,
            "session_stats": {
                "total_scanned": session.total_scanned,
                "expected": session.expected_count,
                "remaining": session.expected_count - session.found_count,
                "progress_percent": round((session.found_count / session.expected_count * 100), 1) if session.expected_count > 0 else 0
            }
        }

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """Get current stats for a session."""
        session = self.db.query(ScanSession).filter(
            ScanSession.session_id == session_id
        ).first()

        if not session:
            raise ValueError("Session not found")

        return {
            "session_id": session.session_id,
            "site_code": session.site_code,
            "session_name": session.session_name,
            "is_active": session.is_active,
            "started_at": session.started_at.isoformat(),
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
            "auditor_name": session.auditor_name,
            "expected_count": session.expected_count,
            "total_scanned": session.total_scanned,
            "found_count": session.found_count,
            "not_tracked_count": session.not_tracked_count,
            "good_count": session.good_count,
            "bad_count": session.bad_count,
            "missing_count": session.expected_count - session.found_count,
            "progress_percent": round((session.found_count / session.expected_count * 100), 1) if session.expected_count > 0 else 0
        }

    def get_scanned_items(
        self,
        session_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get list of scanned items in a session."""
        query = self.db.query(ScanResult).filter(
            ScanResult.session_id == session_id
        ).order_by(ScanResult.scanned_at.desc())

        total = query.count()
        results = query.offset(offset).limit(limit).all()

        items = [{
            "result_id": r.result_id,
            "scanned_value": r.scanned_value,
            "scanned_at": r.scanned_at.isoformat(),
            "scan_status": r.scan_status,
            "master_serial": r.master_serial,
            "master_model": r.master_model,
            "master_asset_type": r.master_asset_type,
            "recorded_condition": r.recorded_condition,
            "location": r.location,
            "notes": r.notes
        } for r in results]

        return items, total

    def get_missing_assets(
        self,
        session_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get assets that haven't been scanned yet in this session.

        These are assets in master data for the site that don't have
        a corresponding scan result.
        """
        session = self.db.query(ScanSession).filter(
            ScanSession.session_id == session_id
        ).first()

        if not session:
            raise ValueError("Session not found")

        # Get all scanned asset IDs in this session
        scanned_ids = self.db.query(ScanResult.asset_id).filter(
            ScanResult.session_id == session_id,
            ScanResult.asset_id.isnot(None)
        ).all()
        scanned_id_set = {r[0] for r in scanned_ids}

        # Get assets not in scanned set
        query = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == session.site_code,
            AssetMaster.is_deleted == False
        )

        if scanned_id_set:
            query = query.filter(AssetMaster.asset_id.notin_(scanned_id_set))

        total = query.count()
        assets = query.order_by(AssetMaster.serial_number).offset(offset).limit(limit).all()

        items = [{
            "asset_id": a.asset_id,
            "serial_number": a.serial_number,
            "hsn": a.hsn,
            "model": a.model,
            "asset_type": a.asset_type,
            "recorded_condition": a.recorded_condition,
            "gl_string": a.gl_string,
            "mdm_status": a.mdm_enrollment_status,
            "mdm_days_since_connect": a.mdm_days_since_connect
        } for a in assets]

        return items, total

    def get_session_history(
        self,
        site_code: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get recent scan sessions for a site."""
        sessions = self.db.query(ScanSession).filter(
            ScanSession.site_code == site_code
        ).order_by(ScanSession.started_at.desc()).limit(limit).all()

        return [{
            "session_id": s.session_id,
            "session_name": s.session_name,
            "started_at": s.started_at.isoformat(),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "is_active": s.is_active,
            "auditor_name": s.auditor_name,
            "expected_count": s.expected_count,
            "total_scanned": s.total_scanned,
            "found_count": s.found_count,
            "progress_percent": round((s.found_count / s.expected_count * 100), 1) if s.expected_count > 0 else 0
        } for s in sessions]
