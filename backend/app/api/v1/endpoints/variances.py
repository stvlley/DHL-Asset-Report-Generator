"""
Variance and action item management endpoints.
"""
from typing import List, Optional
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user, get_client_ip
from app.models.user import User
from app.models.variance import Variance, VarianceType, PriorityLevel, ActionStatus
from app.models.audit import AuditSubmission
from app.schemas.variance import VarianceResponse, VarianceStatusUpdate, VarianceSummary
from app.services.auth_service import AuthService
from app.services.reconciliation_service import ReconciliationService
from app.services.audit_log_service import AuditLogService


router = APIRouter()


@router.get("/{variance_id}", response_model=VarianceResponse)
async def get_variance(
    variance_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get variance by ID."""
    variance = db.query(Variance).filter(
        Variance.variance_id == str(variance_id)
    ).first()

    if not variance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variance not found"
        )

    return variance


@router.get("/{variance_id}/email-template")
async def get_email_template(
    variance_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pre-filled email template for variance."""
    variance = db.query(Variance).filter(
        Variance.variance_id == str(variance_id)
    ).first()

    if not variance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variance not found"
        )

    return {
        "variance_id": str(variance_id),
        "email_template": variance.email_template or "No email template available for this variance type.",
    }


@router.patch("/{variance_id}/status", response_model=VarianceResponse)
async def update_variance_status(
    variance_id: UUID,
    request: Request,
    status_update: VarianceStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update variance/action item status."""
    auth_service = AuthService(db)
    audit_log = AuditLogService(db)

    variance = db.query(Variance).filter(
        Variance.variance_id == str(variance_id)
    ).first()

    if not variance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variance not found"
        )

    # Get audit for permission check
    audit = db.query(AuditSubmission).filter(
        AuditSubmission.audit_id == variance.audit_id
    ).first()

    if not auth_service.check_permission(current_user, "update_action_items", audit.site_code):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this variance"
        )

    old_status = variance.status.value if variance.status else None

    # Update fields
    variance.status = status_update.status

    if status_update.resolution_notes:
        variance.resolution_notes = status_update.resolution_notes

    if status_update.assigned_to:
        variance.assigned_to = status_update.assigned_to

    if status_update.status == ActionStatus.COMPLETED:
        variance.resolved_at = datetime.now(timezone.utc)
        variance.resolved_by = current_user.email

    db.commit()
    db.refresh(variance)

    # Log action
    audit_log.log_variance_update(
        current_user.user_id,
        variance_id,
        old_status,
        status_update.status.value,
        get_client_ip(request)
    )

    return variance


@router.post("/{variance_id}/notes")
async def add_variance_note(
    variance_id: UUID,
    note: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add resolution note to variance."""
    variance = db.query(Variance).filter(
        Variance.variance_id == str(variance_id)
    ).first()

    if not variance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variance not found"
        )

    # Append note with timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    new_note = f"[{timestamp}] {current_user.email}: {note}"

    if variance.resolution_notes:
        variance.resolution_notes = f"{variance.resolution_notes}\n{new_note}"
    else:
        variance.resolution_notes = new_note

    db.commit()

    return {"message": "Note added", "variance_id": str(variance_id)}


# Audit-specific variance endpoints (mounted under /audits but handled here for organization)
@router.get("/audit/{audit_id}/variances", response_model=List[VarianceResponse])
async def list_audit_variances(
    audit_id: UUID,
    variance_type: Optional[VarianceType] = None,
    priority: Optional[PriorityLevel] = None,
    status_filter: Optional[ActionStatus] = Query(None, alias="status"),
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List variances for an audit with optional filters."""
    query = db.query(Variance).filter(Variance.audit_id == str(audit_id))

    if variance_type:
        query = query.filter(Variance.variance_type == variance_type)
    if priority:
        query = query.filter(Variance.priority == priority)
    if status_filter:
        query = query.filter(Variance.status == status_filter)

    return query.order_by(Variance.priority, Variance.serial_number).offset(offset).limit(limit).all()


@router.get("/audit/{audit_id}/variances/summary")
async def get_variance_summary(
    audit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get variance summary statistics for an audit."""
    reconciliation = ReconciliationService(db)

    try:
        return reconciliation.calculate_variance_summary(str(audit_id))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.post("/audit/{audit_id}/variances/bulk-update")
async def bulk_update_variances(
    audit_id: UUID,
    request: Request,
    variance_ids: List[UUID],
    status_update: VarianceStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bulk update status for multiple variances."""
    auth_service = AuthService(db)
    audit_log = AuditLogService(db)

    audit = db.query(AuditSubmission).filter(
        AuditSubmission.audit_id == str(audit_id)
    ).first()

    if not audit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found"
        )

    if not auth_service.check_permission(current_user, "update_action_items", audit.site_code):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized"
        )

    updated = 0
    for variance_id in variance_ids:
        variance = db.query(Variance).filter(
            Variance.variance_id == str(variance_id),
            Variance.audit_id == str(audit_id)
        ).first()

        if variance:
            old_status = variance.status.value if variance.status else None
            variance.status = status_update.status

            if status_update.resolution_notes:
                variance.resolution_notes = status_update.resolution_notes

            if status_update.status == ActionStatus.COMPLETED:
                variance.resolved_at = datetime.now(timezone.utc)
                variance.resolved_by = current_user.email

            audit_log.log_variance_update(
                current_user.user_id,
                variance_id,
                old_status,
                status_update.status.value,
                get_client_ip(request)
            )
            updated += 1

    db.commit()

    return {"message": f"Updated {updated} variances", "updated_count": updated}
