"""
Scan Audit API endpoints for physical inventory scanning workflow.

Provides real-time barcode lookup, condition recording, and missing asset tracking.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.services.scan_audit_service import ScanAuditService


router = APIRouter()


# Request/Response Models
class StartSessionRequest(BaseModel):
    site_code: str
    session_name: Optional[str] = None
    auditor_name: Optional[str] = None


class LookupRequest(BaseModel):
    scanned_value: str


class RecordScanRequest(BaseModel):
    scanned_value: str
    condition: str  # "G", "B", "Good", or "Bad"
    location: Optional[str] = None
    notes: Optional[str] = None


# Session Management
@router.post("/sessions/start")
async def start_scan_session(
    request: StartSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Start a new scan session for a site.

    Automatically closes any existing active sessions for the site.
    Returns session info including expected asset count from master data.
    """
    service = ScanAuditService(db)
    session = service.start_session(
        site_code=request.site_code,
        session_name=request.session_name,
        auditor_name=request.auditor_name or current_user.full_name,
        auditor_user_id=current_user.user_id
    )

    return {
        "session_id": session.session_id,
        "site_code": session.site_code,
        "session_name": session.session_name,
        "auditor_name": session.auditor_name,
        "expected_count": session.expected_count,
        "started_at": session.started_at.isoformat(),
        "message": f"Session started. {session.expected_count} assets expected."
    }


@router.get("/sessions/active/{site_code}")
async def get_active_session(
    site_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the active scan session for a site, if any."""
    service = ScanAuditService(db)
    session = service.get_active_session(site_code)

    if not session:
        return {"active": False, "session": None}

    stats = service.get_session_stats(session.session_id)
    return {"active": True, "session": stats}


@router.post("/sessions/{session_id}/end")
async def end_scan_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """End a scan session."""
    service = ScanAuditService(db)
    session = service.end_session(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    stats = service.get_session_stats(session_id)
    return {
        "message": "Session ended",
        "stats": stats
    }


@router.get("/sessions/{session_id}/stats")
async def get_session_stats(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current stats for a scan session."""
    service = ScanAuditService(db)
    try:
        return service.get_session_stats(session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/sessions/history/{site_code}")
async def get_session_history(
    site_code: str,
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get recent scan sessions for a site."""
    service = ScanAuditService(db)
    sessions = service.get_session_history(site_code, limit)
    return {"sessions": sessions}


# Scanning Operations
@router.post("/sessions/{session_id}/lookup")
async def lookup_scan(
    session_id: str,
    request: LookupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Look up a scanned barcode/serial number.

    Returns:
    - found: Asset details from master data
    - not_tracked: Asset not in master data
    - duplicate: Already scanned in this session

    Does NOT record the scan - use /record to confirm with condition.
    """
    service = ScanAuditService(db)
    try:
        return service.lookup_scan(session_id, request.scanned_value)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.post("/sessions/{session_id}/record")
async def record_scan(
    session_id: str,
    request: RecordScanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Record a scan with condition confirmation.

    Condition can be:
    - "G" or "Good" for good condition
    - "B" or "Bad" for bad condition

    This updates the asset condition in master data if the asset is found.
    """
    service = ScanAuditService(db)
    try:
        return service.record_scan(
            session_id=session_id,
            scanned_value=request.scanned_value,
            condition=request.condition,
            location=request.location,
            notes=request.notes
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/sessions/{session_id}/scanned")
async def get_scanned_items(
    session_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of scanned items in a session (most recent first)."""
    service = ScanAuditService(db)
    try:
        items, total = service.get_scanned_items(session_id, limit, offset)
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/sessions/{session_id}/missing")
async def get_missing_assets(
    session_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get assets that haven't been scanned yet in this session.

    These are assets in master data for the site that don't have
    a corresponding scan result - the "missing" assets.
    """
    service = ScanAuditService(db)
    try:
        items, total = service.get_missing_assets(session_id, limit, offset)
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/sessions/{session_id}/model-breakdown")
async def get_model_breakdown(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get expected vs scanned counts broken down by model and asset type.

    Shows:
    - Expected count per model (from master data)
    - Scanned count per model (from this session)
    - Remaining count per model (expected - scanned)

    Useful for seeing at a glance which device types still need scanning.
    """
    service = ScanAuditService(db)
    try:
        return service.get_model_breakdown(session_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
