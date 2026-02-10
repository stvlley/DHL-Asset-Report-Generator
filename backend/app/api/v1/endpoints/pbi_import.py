"""
PBI/SOTI Import endpoints for uploading connection status data.
"""
import os
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.pbi_import_service import PBIImportService


router = APIRouter()

# Upload directory
UPLOAD_DIR = "/tmp/uploads/pbi"


@router.post("/upload")
async def upload_pbi_data(
    file: UploadFile = File(...),
    site_code: str = Query(..., description="Site code for this upload"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload PBI/SOTI connection status file (CSV or Excel).

    Expected columns:
    - SerialNumber (or SN, Serial): Device serial number
    - Status (or ConnectionStatus): Connection status text
    - Model (optional): Device model
    """
    auth_service = AuthService(db)

    # Check upload permission
    if not auth_service.check_permission(current_user, "upload_audit"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Upload permission required"
        )

    # Validate file type
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided"
        )

    ext = file.filename.lower().split('.')[-1]
    if ext not in ['csv', 'xlsx', 'xls']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be CSV or Excel (.csv, .xlsx, .xls)"
        )

    # Save uploaded file
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{ext}")

    try:
        with open(file_path, 'wb') as f:
            content = await file.read()
            f.write(content)

        # Process file
        pbi_service = PBIImportService(db)
        result = pbi_service.process_upload(
            file_path=file_path,
            file_name=file.filename,
            site_code=site_code,
            user_id=current_user.user_id
        )

        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process file: {str(e)}"
        )
    finally:
        # Clean up temp file
        if os.path.exists(file_path):
            os.remove(file_path)


@router.get("/snapshots/{site_code}")
async def list_pbi_snapshots(
    site_code: str,
    limit: int = Query(12, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List PBI upload snapshots for a site."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "view_all_sites"):
        if site_code not in (current_user.assigned_sites or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

    pbi_service = PBIImportService(db)
    snapshots = pbi_service.get_snapshots(site_code=site_code, limit=limit)

    return {
        "site_code": site_code,
        "count": len(snapshots),
        "snapshots": [
            {
                "snapshot_id": s.snapshot_id,
                "period": s.period,
                "year": s.year,
                "upload_timestamp": s.upload_timestamp.isoformat() if s.upload_timestamp else None,
                "file_name": s.file_name,
                "total_records": s.total_records,
                "connected_count": s.connected_count,
                "disconnected_count": s.disconnected_count,
                "inactive_threshold_days": s.inactive_threshold_days,
            }
            for s in snapshots
        ]
    }


@router.get("/inactive/{site_code}")
async def get_inactive_devices(
    site_code: str,
    days: Optional[int] = Query(None, description="Override inactive threshold"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of inactive devices for a site."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "view_all_sites"):
        if site_code not in (current_user.assigned_sites or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

    pbi_service = PBIImportService(db)
    devices = pbi_service.get_inactive_devices(site_code, threshold_days=days)
    threshold = days or pbi_service.get_inactive_threshold()

    return {
        "site_code": site_code,
        "inactive_threshold_days": threshold,
        "count": len(devices),
        "devices": [
            {
                "device_id": d.device_id,
                "serial_number": d.serial_number,
                "model": d.model,
                "connection_status": d.connection_status,
                "days_since_connect": d.days_since_connect,
                "justification": d.justification,
                "ticket_number": d.ticket_number,
                "justification_date": d.justification_date.isoformat() if d.justification_date else None,
            }
            for d in devices
        ]
    }


@router.post("/justification/{device_id}")
async def add_justification(
    device_id: int,
    justification: str = Query(..., min_length=1),
    ticket_number: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add justification for an inactive device."""
    pbi_service = PBIImportService(db)

    device = pbi_service.add_justification(
        device_id=device_id,
        justification=justification,
        ticket_number=ticket_number,
        user_id=current_user.user_id
    )

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )

    return {
        "status": "success",
        "device_id": device.device_id,
        "serial_number": device.serial_number,
        "justification": device.justification,
        "ticket_number": device.ticket_number,
    }


@router.get("/summary/{site_code}")
async def get_connection_summary(
    site_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get connection status summary for a site."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "view_all_sites"):
        if site_code not in (current_user.assigned_sites or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

    pbi_service = PBIImportService(db)
    return pbi_service.get_connection_summary(site_code)


@router.delete("/snapshots/{snapshot_id}")
async def delete_pbi_snapshot(
    snapshot_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a PBI snapshot and all its devices.

    Admin only. This permanently removes the snapshot data.
    """
    from app.models.user import UserRole
    from app.models.pbi_snapshot import PBISnapshot, PBIDevice

    # Admin only
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    snapshot = db.query(PBISnapshot).filter(
        PBISnapshot.snapshot_id == snapshot_id
    ).first()

    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found"
        )

    site_code = snapshot.site_code

    # Delete associated devices first
    db.query(PBIDevice).filter(
        PBIDevice.snapshot_id == snapshot_id
    ).delete()

    # Delete the snapshot
    db.delete(snapshot)
    db.commit()

    return {
        "status": "deleted",
        "message": f"PBI Snapshot {snapshot_id} for site {site_code} deleted"
    }
