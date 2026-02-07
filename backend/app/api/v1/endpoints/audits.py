"""
Audit submission and management endpoints.
"""
from typing import List, Optional
from io import BytesIO
from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user, get_client_ip
from app.models.user import User
from app.models.audit import AuditSubmission, AuditDetail, ProcessingStatus
from app.models.site import Site
from app.schemas.audit import AuditResponse, AuditDetailResponse, AuditUploadResponse, ValidationError
from app.services.auth_service import AuthService
from app.services.file_service import FileService
from app.services.reconciliation_service import ReconciliationService
from app.services.report_service import ReportService
from app.services.audit_log_service import AuditLogService


router = APIRouter()


@router.get("/template/download")
async def download_audit_template():
    """
    Download the physical audit scan template.
    This template should be used to upload scanned physical audit data.
    """
    # Create template DataFrame with minimal required columns
    # Asset Type and Model are looked up from IT Allocation data
    template_data = {
        "SN": ["22351830501754", "22351830501755", ""],
        "Asset Number": ["", "", "AST-00123"],
        "Condition": ["Good", "Bad", "Good"],
        "Comment": ["Zone A - Receiving", "Screen cracked", "Zone B"],
    }

    df = pd.DataFrame(template_data)

    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Audit Scan")

        # Add instructions sheet
        instructions = pd.DataFrame({
            "Field": ["SN", "Asset Number", "Condition", "Comment"],
            "Description": [
                "Serial Number - Scanned from device barcode. Use this OR Asset Number.",
                "Internal asset tag if SN not available. Use this OR SN.",
                "Physical condition of the device (Required)",
                "Additional notes about location or condition (Optional)"
            ],
            "Required": ["Yes*", "Yes*", "Yes", "No"],
            "Valid Values": [
                "Alphanumeric (e.g., 22351830501754)",
                "Alphanumeric (e.g., AST-00123)",
                "Good, Bad",
                "Free text"
            ],
            "Notes": [
                "*Either SN or Asset Number required",
                "*Either SN or Asset Number required",
                "Asset Type & Model auto-populated from IT Allocation",
                "Location, damage notes, etc."
            ]
        })
        instructions.to_excel(writer, index=False, sheet_name="Instructions")

    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=physical_audit_template.xlsx"}
    )


@router.post("/upload", response_model=AuditUploadResponse)
async def upload_audit(
    request: Request,
    site_code: str = Form(...),
    audit_date: date = Form(...),
    auditor_name: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload physical audit Excel/CSV file.
    Triggers reconciliation processing.
    """
    auth_service = AuthService(db)
    file_service = FileService(db)
    audit_log = AuditLogService(db)

    # Check permission
    if not auth_service.check_permission(current_user, "upload_audit", site_code):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to upload audits for this site"
        )

    # Verify site exists
    site = db.query(Site).filter(Site.site_code == site_code).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Site {site_code} not found"
        )

    # Validate audit date (not in future)
    if audit_date > date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audit date cannot be in the future"
        )

    # Validate file extension
    valid, error = file_service.validate_file_extension(file.filename)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )

    # Parse file
    contents = await file.read()
    df, errors, warnings = file_service.parse_audit_file(BytesIO(contents), file.filename)

    if errors:
        return AuditUploadResponse(
            status="error",
            audit_id=None,
            message="Validation errors in file",
            total_assets=0,
            processing_status=ProcessingStatus.ERROR,
            validation_errors=[ValidationError(**e) for e in errors],
            warnings=[ValidationError(**w) for w in warnings],
        )

    # Create audit submission
    audit = AuditSubmission(
        site_code=site_code,
        audit_date=audit_date,
        auditor_name=auditor_name,
        uploaded_by=current_user.user_id,
        file_name=file.filename,
        processing_status=ProcessingStatus.PENDING,
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    # Process audit details
    try:
        file_service.process_audit_upload(df, audit)

        # Run reconciliation
        reconciliation = ReconciliationService(db)
        reconciliation.reconcile_audit(audit.audit_id)

        # Log action
        audit_log.log_audit_upload(
            current_user.user_id,
            audit.audit_id,
            site_code,
            get_client_ip(request)
        )

        # Ensure all changes are committed before returning
        db.commit()
        db.refresh(audit)

        return AuditUploadResponse(
            status="success",
            audit_id=audit.audit_id,
            message="Audit uploaded and processed successfully",
            total_assets=audit.total_assets_found,
            processing_status=audit.processing_status,
            warnings=[ValidationError(**w) for w in warnings],
        )

    except Exception as e:
        audit.processing_status = ProcessingStatus.ERROR
        audit.error_message = str(e)
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing audit: {str(e)}"
        )


@router.post("/{audit_id}/mdm-upload")
async def upload_mdm_data(
    audit_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload optional MDM data to enrich audit analysis."""
    file_service = FileService(db)

    audit = db.query(AuditSubmission).filter(
        AuditSubmission.audit_id == str(audit_id)
    ).first()

    if not audit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found"
        )

    # Parse MDM file
    contents = await file.read()
    df, errors = file_service.parse_mdm_file(BytesIO(contents), file.filename)

    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Validation errors", "errors": errors}
        )

    # Process MDM upload
    snapshot = file_service.process_mdm_upload(df, str(audit_id), file.filename)

    # Re-run reconciliation with MDM data
    reconciliation = ReconciliationService(db)
    # Clear existing MDM-related variances
    from app.models.variance import Variance, VarianceType
    db.query(Variance).filter(
        Variance.audit_id == str(audit_id),
        Variance.variance_type.in_([
            VarianceType.MDM_NOT_ENROLLED,
            VarianceType.MDM_INACTIVE_WARNING
        ])
    ).delete()
    db.commit()

    # Re-run to add MDM checks
    reconciliation.reconcile_audit(str(audit_id))

    return {
        "status": "success",
        "snapshot_id": str(snapshot.snapshot_id),
        "total_records": snapshot.total_records,
    }


@router.get("", response_model=List[AuditResponse])
async def list_audits(
    site_code: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List audit submissions."""
    auth_service = AuthService(db)

    query = db.query(AuditSubmission)

    if site_code:
        if not auth_service.check_permission(current_user, "view_all_sites"):
            if site_code not in (current_user.assigned_sites or []):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )
        query = query.filter(AuditSubmission.site_code == site_code)
    elif not auth_service.check_permission(current_user, "view_all_sites"):
        if current_user.assigned_sites:
            query = query.filter(AuditSubmission.site_code.in_(current_user.assigned_sites))
        else:
            return []

    return query.order_by(AuditSubmission.audit_date.desc()).offset(offset).limit(limit).all()


@router.get("/{audit_id}", response_model=AuditResponse)
async def get_audit(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get audit by ID."""
    audit = db.query(AuditSubmission).filter(
        AuditSubmission.audit_id == str(audit_id)
    ).first()

    if not audit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found"
        )

    return audit


@router.get("/{audit_id}/details", response_model=List[AuditDetailResponse])
async def get_audit_details(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get audit detail records."""
    audit = db.query(AuditSubmission).filter(
        AuditSubmission.audit_id == str(audit_id)
    ).first()

    if not audit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found"
        )

    details = db.query(AuditDetail).filter(
        AuditDetail.audit_id == str(audit_id)
    ).order_by(AuditDetail.row_number).all()

    return details


@router.get("/{audit_id}/reports/executive-summary")
async def get_executive_summary(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get executive summary report data."""
    report_service = ReportService(db)

    try:
        return report_service.generate_executive_summary(str(audit_id))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/{audit_id}/reports/action-list")
async def get_action_list(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed action item list."""
    report_service = ReportService(db)
    return report_service.generate_action_list(str(audit_id))


@router.get("/{audit_id}/reports/export-excel")
async def export_audit_excel(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export audit results to Excel."""
    from app.models.variance import Variance

    audit = db.query(AuditSubmission).filter(
        AuditSubmission.audit_id == str(audit_id)
    ).first()

    if not audit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found"
        )

    variances = db.query(Variance).filter(
        Variance.audit_id == str(audit_id)
    ).order_by(Variance.priority, Variance.variance_type).all()

    # Create DataFrame
    data = [{
        "Serial Number": v.serial_number,
        "Asset Type": v.asset_type,
        "Model": v.model,
        "Variance Type": v.variance_type.value if v.variance_type else None,
        "Priority": v.priority.value if v.priority else None,
        "Current GL Site": v.current_gl_site,
        "Physical Site": v.physical_site,
        "Monthly Cost Impact": float(v.monthly_cost_impact) if v.monthly_cost_impact else None,
        "Action Required": v.action_required,
        "Status": v.status.value if v.status else None,
    } for v in variances]

    df = pd.DataFrame(data)

    output = BytesIO()
    df.to_excel(output, index=False, engine="openpyxl")
    output.seek(0)

    filename = f"audit_results_{audit.site_code}_{audit.audit_date}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.delete("/{audit_id}")
async def delete_audit(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete audit (admin only)."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "delete_audits"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    audit = db.query(AuditSubmission).filter(
        AuditSubmission.audit_id == str(audit_id)
    ).first()

    if not audit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found"
        )

    db.delete(audit)
    db.commit()

    return {"message": "Audit deleted"}
