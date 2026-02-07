"""
Master Data Management API endpoints.
CRUD operations for AssetMaster, IT Allocation sync, and SOTI integration.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.asset import AssetMaster, AssetSource, MDMEnrollmentStatus
from app.services.master_data_service import MasterDataService
from app.services.auth_service import AuthService


router = APIRouter()


# Pydantic models for API
class AssetCreate(BaseModel):
    serial_number: str
    assigned_site_code: str
    asset_type: str
    model: str
    gl_string: str
    hsn: Optional[str] = None
    mac_address: Optional[str] = None
    imei: Optional[str] = None
    manufacturer: Optional[str] = None
    recorded_condition: Optional[str] = "Good"
    cost_per_month: Optional[float] = None
    notes: Optional[str] = None


class AssetUpdate(BaseModel):
    serial_number: Optional[str] = None
    assigned_site_code: Optional[str] = None
    hsn: Optional[str] = None
    mac_address: Optional[str] = None
    imei: Optional[str] = None
    asset_type: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None
    gl_string: Optional[str] = None
    recorded_condition: Optional[str] = None
    cost_per_month: Optional[float] = None
    notes: Optional[str] = None


class AssetTransfer(BaseModel):
    new_site_code: str
    new_gl_string: Optional[str] = None
    notes: Optional[str] = None


class AssetResponse(BaseModel):
    asset_id: str
    serial_number: str
    assigned_site_code: str
    hsn: Optional[str]
    mac_address: Optional[str]
    imei: Optional[str]
    mdm_device_id: Optional[str]
    asset_type: str
    model: str
    manufacturer: Optional[str]
    gl_string: str
    recorded_condition: Optional[str]
    cost_per_month: Optional[float]
    source: Optional[str]
    mdm_enrollment_status: Optional[str]
    mdm_last_seen: Optional[str]
    mdm_days_since_connect: Optional[int]
    mdm_device_name: Optional[str]
    previous_site_code: Optional[str]
    transfer_date: Optional[str]
    is_deleted: bool
    created_at: str
    updated_at: str
    notes: Optional[str]

    class Config:
        from_attributes = True


class SyncFromAllocationRequest(BaseModel):
    snapshot_id: str
    site_code: Optional[str] = None


class YearlySummaryResponse(BaseModel):
    year: int
    total_annual_cost: float
    average_monthly_cost: float
    monthly_breakdown: list
    by_category: dict
    by_gl_string: dict


# CRUD Endpoints
@router.get("", response_model=dict)
async def list_assets(
    site_code: Optional[str] = None,
    asset_type: Optional[str] = None,
    mdm_status: Optional[str] = None,
    search: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List assets with filtering and pagination."""
    service = MasterDataService(db)
    assets, total = service.get_master_assets(
        site_code=site_code,
        asset_type=asset_type,
        mdm_status=mdm_status,
        search=search,
        include_deleted=include_deleted,
        limit=limit,
        offset=offset
    )

    return {
        "items": [_asset_to_response(a) for a in assets],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/stats")
async def get_master_stats(
    site_code: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary statistics for master data."""
    service = MasterDataService(db)
    return service.get_master_stats(site_code)


@router.get("/disconnected")
async def get_disconnected_devices(
    site_code: Optional[str] = None,
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get devices that haven't connected to MDM in X days."""
    service = MasterDataService(db)
    assets = service.get_mdm_disconnected_devices(site_code, days)
    return {
        "days_threshold": days,
        "count": len(assets),
        "devices": [_asset_to_response(a) for a in assets]
    }


@router.get("/yearly-summary", response_model=YearlySummaryResponse)
async def get_yearly_summary(
    year: int,
    site_code: Optional[str] = None,
    gl_string: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get yearly cost aggregation from IT Allocation data."""
    service = MasterDataService(db)
    return service.get_yearly_allocation_summary(year, site_code, gl_string)


@router.get("/{asset_id}")
async def get_asset(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single asset by ID."""
    asset = db.query(AssetMaster).filter(
        AssetMaster.asset_id == asset_id
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    return _asset_to_response(asset)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_asset(
    data: AssetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new asset in the master database."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_assets"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to create assets"
        )

    service = MasterDataService(db)

    try:
        asset = service.create_asset(data.model_dump(), current_user.user_id)
        return _asset_to_response(asset)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.patch("/{asset_id}")
async def update_asset(
    asset_id: str,
    data: AssetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an asset."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_assets"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update assets"
        )

    service = MasterDataService(db)

    try:
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        asset = service.update_asset(asset_id, updates, current_user.user_id)
        return _asset_to_response(asset)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.post("/{asset_id}/transfer")
async def transfer_asset(
    asset_id: str,
    data: AssetTransfer,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Transfer an asset to a different site."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_assets"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to transfer assets"
        )

    service = MasterDataService(db)

    try:
        asset = service.transfer_asset(
            asset_id,
            data.new_site_code,
            data.new_gl_string,
            data.notes,
            current_user.user_id
        )
        return _asset_to_response(asset)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: str,
    hard_delete: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an asset (soft delete by default)."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_assets"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete assets"
        )

    service = MasterDataService(db)
    success = service.delete_asset(asset_id, current_user.user_id, hard_delete)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    return {"message": "Asset deleted", "asset_id": asset_id}


# IT Allocation Sync
@router.post("/sync-from-allocation")
async def sync_from_it_allocation(
    data: SyncFromAllocationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sync assets from an IT Allocation snapshot to the master database.
    This creates/updates AssetMaster records from IT Allocation data.
    """
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_assets"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to sync assets"
        )

    service = MasterDataService(db)

    try:
        result = service.sync_from_it_allocation(
            data.snapshot_id,
            data.site_code,
            current_user.user_id
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# KLS Workbook Import
class KLSImportRequest(BaseModel):
    site_code: str
    gl_string: str


@router.post("/import-kls-workbook")
async def import_kls_workbook(
    site_code: str,
    gl_string: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import a KLS-style multi-sheet asset audit workbook.

    This imports:
    - Asset Detail → Master database
    - IT Allocation Import → Syncs costs and HSN/MAC
    - PBI Import → Syncs SOTI connection status
    - Scan Audit → Processes scan statistics

    Requires the Excel file to be uploaded.
    """
    import tempfile
    import os
    from app.services.kls_import_service import KLSImportService

    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_assets"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to import assets"
        )

    # Save to temp file
    contents = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        service = KLSImportService(db)
        result = service.import_workbook(
            tmp_path,
            site_code,
            gl_string,
            current_user.user_id
        )

        # Get reconciliation summary
        summary = service.get_reconciliation_summary(site_code)

        return {
            "status": "success",
            "import_stats": result,
            "reconciliation_summary": summary
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    finally:
        os.unlink(tmp_path)


@router.get("/reconciliation-summary/{site_code}")
async def get_reconciliation_summary(
    site_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get reconciliation summary for a site."""
    service = MasterDataService(db)
    return service.get_reconciliation_summary(site_code)


@router.post("/upload-mdm-status")
async def upload_mdm_status(
    file: UploadFile = File(...),
    site_code: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload MDM/SOTI connection status from a simple file.

    Accepts CSV or Excel with two required columns:
    - Serial Number (or SN, Serial, Device ID)
    - Status (or Connection Status, MDM Status)
      Values: "Connected in last 60 days" / "Not Connected in last 60 days"
              or simply "Connected" / "Disconnected"

    This is a simple alternative to the complex KLS workbook import.
    Sites can export their SOTI/PBI report and upload it directly.
    """
    import tempfile
    import os

    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_assets"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to upload MDM status"
        )

    # Determine file type
    filename = file.filename.lower() if file.filename else ""
    if filename.endswith('.csv'):
        suffix = ".csv"
    else:
        suffix = ".xlsx"

    # Save to temp file
    contents = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        service = MasterDataService(db)
        result = service.upload_mdm_status(
            tmp_path,
            site_code,
            current_user.user_id
        )

        return {
            "status": "success",
            "message": f"Updated {result['matched']} devices ({result['connected']} connected, {result['disconnected']} disconnected)",
            "stats": result
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing file: {str(e)}"
        )
    finally:
        os.unlink(tmp_path)


def _asset_to_response(asset: AssetMaster) -> dict:
    """Convert AssetMaster to response dict."""
    return {
        "asset_id": asset.asset_id,
        "serial_number": asset.serial_number,
        "assigned_site_code": asset.assigned_site_code,
        "hsn": asset.hsn,
        "mac_address": asset.mac_address,
        "imei": asset.imei,
        "mdm_device_id": asset.mdm_device_id,
        "asset_type": asset.asset_type,
        "model": asset.model,
        "manufacturer": asset.manufacturer,
        "gl_string": asset.gl_string,
        "recorded_condition": asset.recorded_condition,
        "cost_per_month": float(asset.cost_per_month) if asset.cost_per_month else None,
        "source": asset.source,
        "mdm_enrollment_status": asset.mdm_enrollment_status,
        "mdm_last_seen": asset.mdm_last_seen.isoformat() if asset.mdm_last_seen else None,
        "mdm_days_since_connect": asset.mdm_days_since_connect,
        "mdm_device_name": asset.mdm_device_name,
        "previous_site_code": asset.previous_site_code,
        "transfer_date": asset.transfer_date.isoformat() if asset.transfer_date else None,
        "is_deleted": asset.is_deleted,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "updated_at": asset.updated_at.isoformat() if asset.updated_at else None,
        "notes": asset.notes
    }
