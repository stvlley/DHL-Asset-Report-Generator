"""
IT Allocation API endpoints.
Handles monthly IT cost allocation data uploads and device lookups.
"""
import os
import tempfile
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserRole
from app.services.it_allocation_service import ITAllocationService
from app.services.master_data_service import MasterDataService
from app.schemas.it_allocation import (
    ITAllocationUploadResponse,
    ITAllocationSnapshotResponse,
    ITAllocationSnapshotDetail,
    ITAllocationDeviceResponse,
    DeviceLookupResponse,
    GLStringSummary,
    SiteGLMappingCreate,
    SiteGLMappingResponse,
)


router = APIRouter()


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role for certain operations."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


@router.post("/upload", response_model=ITAllocationUploadResponse)
async def upload_it_allocation(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Upload monthly IT Allocation Excel file.

    Extracts RF Hardware and RF Software devices with their:
    - HSN (Hardware Serial Number)
    - MAC Address
    - GL String (cost allocation code)
    - Device Model
    - Monthly Amount

    Only admins can upload IT Allocation data.
    """
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an Excel file (.xlsx or .xls)"
        )

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        service = ITAllocationService(db)
        result = service.process_upload(
            file_path=tmp_path,
            file_name=file.filename,
            user_id=current_user.user_id
        )

        if result.status == "error":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result.message
            )

        # Auto-sync to master data
        if result.snapshot_id:
            try:
                master_service = MasterDataService(db)
                sync_result = master_service.sync_from_it_allocation(
                    snapshot_id=result.snapshot_id,
                    user_id=current_user.user_id
                )
                result.master_sync = {
                    "created": sync_result.get("created", 0),
                    "updated": sync_result.get("updated", 0),
                    "total": sync_result.get("total_devices", 0)
                }
            except Exception as e:
                # Don't fail the upload if master sync fails
                result.master_sync = {"error": str(e)}

        return result

    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.get("/snapshots", response_model=List[ITAllocationSnapshotResponse])
async def list_snapshots(
    limit: int = Query(12, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List IT Allocation upload snapshots (most recent first)."""
    service = ITAllocationService(db)
    return service.get_snapshots(limit=limit)


@router.get("/snapshots/{snapshot_id}", response_model=ITAllocationSnapshotDetail)
async def get_snapshot(
    snapshot_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific snapshot including devices."""
    from app.models.it_allocation import ITAllocationSnapshot

    snapshot = db.query(ITAllocationSnapshot).filter(
        ITAllocationSnapshot.snapshot_id == snapshot_id
    ).first()

    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found"
        )

    return snapshot


@router.delete("/snapshots/{snapshot_id}")
async def delete_snapshot(
    snapshot_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Delete an IT Allocation snapshot and all its devices.

    Admin only. This permanently removes the snapshot data.
    """
    from app.models.it_allocation import ITAllocationSnapshot, ITAllocationDevice

    snapshot = db.query(ITAllocationSnapshot).filter(
        ITAllocationSnapshot.snapshot_id == snapshot_id
    ).first()

    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found"
        )

    # Delete associated devices first
    db.query(ITAllocationDevice).filter(
        ITAllocationDevice.snapshot_id == snapshot_id
    ).delete()

    # Delete the snapshot
    db.delete(snapshot)
    db.commit()

    return {
        "status": "deleted",
        "message": f"Snapshot {snapshot_id} and all associated devices deleted"
    }


@router.get("/snapshots/{snapshot_id}/devices", response_model=List[ITAllocationDeviceResponse])
async def get_snapshot_devices(
    snapshot_id: str,
    category: Optional[str] = Query(None, description="Filter by category (RF HARDWARE or RF SOFTWARE)"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get devices from a specific snapshot."""
    service = ITAllocationService(db)
    return service.get_snapshot_devices(
        snapshot_id=snapshot_id,
        category=category,
        limit=limit,
        offset=offset
    )


@router.get("/lookup/{serial_number}", response_model=DeviceLookupResponse)
async def lookup_device(
    serial_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Look up a device by serial number (HSN) or MAC address.

    Searches the latest IT Allocation snapshot for the device
    and returns its GL string and other details.
    """
    service = ITAllocationService(db)
    return service.lookup_device(serial_number)


@router.get("/gl-summary", response_model=List[GLStringSummary])
async def get_gl_summary(
    snapshot_id: Optional[str] = Query(None, description="Specific snapshot ID, or latest if not provided"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get summary of GL strings with device counts and amounts."""
    service = ITAllocationService(db)
    return service.get_gl_summary(snapshot_id=snapshot_id)


# Site GL Mapping endpoints
@router.post("/site-gl-mappings", response_model=SiteGLMappingResponse)
async def create_site_gl_mapping(
    mapping: SiteGLMappingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a site to GL string mapping."""
    service = ITAllocationService(db)
    return service.create_site_gl_mapping(
        site_code=mapping.site_code,
        gl_string=mapping.gl_string,
        category=mapping.category,
        is_primary=mapping.is_primary,
        notes=mapping.notes
    )


@router.get("/site-gl-mappings/{site_code}", response_model=List[SiteGLMappingResponse])
async def get_site_gl_mappings(
    site_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all GL mappings for a site."""
    service = ITAllocationService(db)
    return service.get_site_gl_mappings(site_code)


@router.delete("/site-gl-mappings/{mapping_id}")
async def delete_site_gl_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete a site GL mapping."""
    service = ITAllocationService(db)
    if not service.delete_site_gl_mapping(mapping_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mapping not found"
        )
    return {"status": "deleted"}


@router.get("/site-gl-mappings/{site_code}/validate")
async def validate_site_gl_mappings(
    site_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Validate a site's GL mappings against IT Allocation data.

    Returns:
    - mapped_gl_strings: GL strings assigned to this site
    - allocation_gl_strings: GL strings found in IT Allocation
    - missing_in_allocation: Site GL strings not found in allocation data
    - available_in_allocation: Allocation GL strings not mapped to site
    - valid: True if all site GL strings exist in allocation
    """
    service = ITAllocationService(db)
    return service.validate_site_gl_against_allocation(site_code)
