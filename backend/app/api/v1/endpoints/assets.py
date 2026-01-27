"""
Master data (assets) management endpoints.
"""
from typing import List, Optional
from io import BytesIO
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user, get_client_ip
from app.models.user import User
from app.models.asset import AssetMaster
from app.schemas.asset import AssetCreate, AssetUpdate, AssetResponse, AssetBulkUpload
from app.services.auth_service import AuthService
from app.services.file_service import FileService
from app.services.audit_log_service import AuditLogService


router = APIRouter()


@router.get("/assets", response_model=List[AssetResponse])
async def list_assets(
    site_code: Optional[str] = None,
    asset_type: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List master data assets with optional filters."""
    auth_service = AuthService(db)

    query = db.query(AssetMaster).filter(AssetMaster.is_deleted == False)

    if site_code:
        # Check access to site
        if not auth_service.check_permission(current_user, "view_all_sites"):
            if site_code not in (current_user.assigned_sites or []):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this site"
                )
        query = query.filter(AssetMaster.assigned_site_code == site_code)
    elif not auth_service.check_permission(current_user, "view_all_sites"):
        # Filter to user's sites
        if current_user.assigned_sites:
            query = query.filter(AssetMaster.assigned_site_code.in_(current_user.assigned_sites))
        else:
            return []

    if asset_type:
        query = query.filter(AssetMaster.asset_type == asset_type)

    return query.order_by(AssetMaster.serial_number).offset(offset).limit(limit).all()


@router.get("/assets/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get asset by ID."""
    asset = db.query(AssetMaster).filter(
        AssetMaster.asset_id == asset_id,
        AssetMaster.is_deleted == False
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    return asset


@router.post("/assets/bulk-upload", response_model=AssetBulkUpload)
async def bulk_upload_assets(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Bulk upload master data from Excel/CSV file.
    Admin only.
    """
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "upload_master_data"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for master data upload"
        )

    file_service = FileService(db)
    audit_log = AuditLogService(db)

    # Validate file extension
    valid, error = file_service.validate_file_extension(file.filename)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )

    # Parse file
    contents = await file.read()
    df, errors, warnings = file_service.parse_master_data_file(
        BytesIO(contents), file.filename
    )

    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Validation errors in file", "errors": errors}
        )

    # Process upload
    result = file_service.process_master_data_upload(df, current_user.email)

    # Log action
    audit_log.log_master_data_upload(
        current_user.user_id,
        result["created"],
        result["updated"],
        get_client_ip(request)
    )

    return AssetBulkUpload(**result, warnings=warnings)


@router.put("/assets/{asset_id}", response_model=AssetResponse)
async def update_asset(
    asset_id: UUID,
    asset_data: AssetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update asset (admin only)."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "upload_master_data"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    asset = db.query(AssetMaster).filter(
        AssetMaster.asset_id == asset_id,
        AssetMaster.is_deleted == False
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    update_data = asset_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(asset, field, value)

    asset.updated_by = current_user.email
    db.commit()
    db.refresh(asset)

    return asset


@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Soft delete asset (admin only)."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "upload_master_data"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    asset = db.query(AssetMaster).filter(
        AssetMaster.asset_id == asset_id,
        AssetMaster.is_deleted == False
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    from datetime import datetime, timezone
    asset.is_deleted = True
    asset.deleted_at = datetime.now(timezone.utc)
    asset.deleted_by = current_user.email
    db.commit()

    return {"message": "Asset deleted"}


@router.get("/assets/export")
async def export_assets(
    site_code: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export master data to Excel."""
    auth_service = AuthService(db)

    query = db.query(AssetMaster).filter(AssetMaster.is_deleted == False)

    if site_code:
        if not auth_service.check_permission(current_user, "view_all_sites"):
            if site_code not in (current_user.assigned_sites or []):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )
        query = query.filter(AssetMaster.assigned_site_code == site_code)

    assets = query.all()

    # Create DataFrame
    data = [{
        "serial_number": a.serial_number,
        "asset_type": a.asset_type,
        "model": a.model,
        "assigned_site_code": a.assigned_site_code,
        "gl_string": a.gl_string,
        "acquisition_date": a.acquisition_date,
        "recorded_condition": a.recorded_condition,
        "cost_per_month": float(a.cost_per_month) if a.cost_per_month else None,
    } for a in assets]

    df = pd.DataFrame(data)

    # Export to Excel
    output = BytesIO()
    df.to_excel(output, index=False, engine="openpyxl")
    output.seek(0)

    filename = f"master_data_{site_code or 'all'}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
