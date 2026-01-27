"""
Dashboard endpoints for portfolio and site metrics.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.report_service import ReportService


router = APIRouter()


@router.get("/portfolio-summary")
async def get_portfolio_summary(
    account_name: Optional[str] = None,
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get portfolio-wide summary across all sites.
    Filtered by user's access permissions.
    """
    auth_service = AuthService(db)
    report_service = ReportService(db)

    # Check dashboard access
    if not auth_service.check_permission(current_user, "view_dashboard"):
        # For non-dashboard users, still allow viewing their sites
        if not current_user.assigned_sites:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No sites assigned"
            )

    summary = report_service.get_portfolio_summary(
        account_name=account_name,
        region=region
    )

    # Filter sites based on user access if not admin
    if not auth_service.check_permission(current_user, "view_all_sites"):
        if current_user.assigned_sites:
            summary["site_details"] = [
                s for s in summary["site_details"]
                if s["site_code"] in current_user.assigned_sites
            ]
            # Recalculate totals
            summary["total_sites"] = len(summary["site_details"])
            summary["total_assets_in_gl"] = sum(
                s["assets_in_gl"] for s in summary["site_details"]
            )
            summary["total_potential_savings"] = sum(
                s["potential_monthly_savings"] or 0 for s in summary["site_details"]
            )
            summary["high_priority_items"] = sum(
                s["high_priority_items"] for s in summary["site_details"]
            )
            summary["sites_with_overdue_audits"] = sum(
                1 for s in summary["site_details"] if s["is_overdue"]
            )

    return summary


@router.get("/site-metrics/{site_code}")
async def get_site_metrics(
    site_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed metrics for a specific site."""
    auth_service = AuthService(db)
    report_service = ReportService(db)

    # Check site access
    if not auth_service.check_permission(current_user, "view_all_sites"):
        if site_code not in (current_user.assigned_sites or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this site"
            )

    try:
        return report_service.get_site_metrics(site_code)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/trends")
async def get_trends(
    site_code: Optional[str] = None,
    months: int = 6,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get GL accuracy trends over time.
    If site_code is provided, returns site-specific trends.
    Otherwise returns portfolio-wide trends.
    """
    from datetime import date, timedelta
    from sqlalchemy import func
    from app.models.audit import AuditSubmission
    from app.models.variance import Variance, VarianceType
    from app.models.asset import AssetMaster

    auth_service = AuthService(db)

    # Check access
    if site_code:
        if not auth_service.check_permission(current_user, "view_all_sites"):
            if site_code not in (current_user.assigned_sites or []):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied"
                )

    trends = []
    today = date.today()

    for i in range(months - 1, -1, -1):
        # Calculate month start/end
        month_date = today.replace(day=1) - timedelta(days=i * 30)
        month_start = month_date.replace(day=1)
        if month_date.month == 12:
            month_end = month_date.replace(year=month_date.year + 1, month=1, day=1)
        else:
            month_end = month_date.replace(month=month_date.month + 1, day=1)

        # Get audits for this month
        query = db.query(AuditSubmission).filter(
            AuditSubmission.audit_date >= month_start,
            AuditSubmission.audit_date < month_end,
            AuditSubmission.processing_status.in_(["completed", "completed_with_warnings"])
        )

        if site_code:
            query = query.filter(AuditSubmission.site_code == site_code)
        elif not auth_service.check_permission(current_user, "view_all_sites"):
            if current_user.assigned_sites:
                query = query.filter(AuditSubmission.site_code.in_(current_user.assigned_sites))

        audits = query.all()

        if not audits:
            trends.append({
                "month": month_start.strftime("%Y-%m"),
                "gl_accuracy_pct": None,
                "potential_savings": 0,
                "total_assets": 0,
            })
            continue

        # Calculate metrics for month
        total_correct = 0
        total_in_gl = 0
        total_savings = 0

        for audit in audits:
            variances = db.query(Variance).filter(
                Variance.audit_id == audit.audit_id
            ).all()

            correct = sum(1 for v in variances if v.variance_type == VarianceType.CORRECT)
            total_correct += correct

            assets_in_gl = db.query(AssetMaster).filter(
                AssetMaster.assigned_site_code == audit.site_code,
                AssetMaster.is_deleted == False
            ).count()
            total_in_gl += assets_in_gl

            savings = sum(
                float(v.monthly_cost_impact or 0)
                for v in variances
                if v.variance_type == VarianceType.MISSING
            )
            total_savings += savings

        accuracy = (total_correct / total_in_gl * 100) if total_in_gl > 0 else None

        trends.append({
            "month": month_start.strftime("%Y-%m"),
            "gl_accuracy_pct": round(accuracy, 1) if accuracy else None,
            "potential_savings": round(total_savings, 2),
            "total_assets": total_in_gl,
        })

    return {
        "site_code": site_code,
        "trends": trends,
    }
