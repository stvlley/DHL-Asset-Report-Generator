"""
Report generation and email delivery endpoints.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.kls_report_service import KLSReportService
from app.services.email_service import EmailService


router = APIRouter()


class RecipientsUpdate(BaseModel):
    """Update recipients for a site."""
    director_email: Optional[str] = None
    gm_emails: Optional[List[str]] = None
    report_recipients: Optional[List[str]] = None


class EmailSendRequest(BaseModel):
    """Request to send report via email."""
    recipients: Optional[List[str]] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    period: Optional[str] = None


@router.post("/generate/{site_code}")
async def generate_kls_report(
    site_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate KLS-format Excel report for a site.

    Returns the path to the generated file for download.
    """
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "view_all_sites"):
        if site_code not in (current_user.assigned_sites or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

    try:
        kls_service = KLSReportService(db)
        output_path = kls_service.generate_excel_report(site_code)

        return {
            "status": "success",
            "site_code": site_code,
            "file_path": output_path,
            "message": f"Report generated successfully"
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate report: {str(e)}"
        )


@router.post("/send/{site_code}")
async def send_report_email(
    site_code: str,
    request: EmailSendRequest = Body(default=EmailSendRequest()),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate and send report via email.

    If recipients not provided, uses site's configured recipients.
    """
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "upload_audit"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required to send reports"
        )

    # Generate report first
    kls_service = KLSReportService(db)
    try:
        report_path = kls_service.generate_excel_report(site_code)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate report: {str(e)}"
        )

    # Send email
    email_service = EmailService(db)
    result = email_service.send_report(
        site_code=site_code,
        recipients=request.recipients,
        attachment_path=report_path,
        subject=request.subject,
        body=request.body,
        period=request.period
    )

    return result


@router.get("/recipients/{site_code}")
async def get_report_recipients(
    site_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get configured email recipients for a site."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "view_all_sites"):
        if site_code not in (current_user.assigned_sites or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

    email_service = EmailService(db)
    recipients = email_service.get_site_recipients(site_code)

    from app.models.site import Site
    site = db.query(Site).filter(Site.site_code == site_code).first()

    return {
        "site_code": site_code,
        "director_email": site.director_email if site else None,
        "gm_emails": site.gm_emails if site else None,
        "report_recipients": site.report_recipients if site else None,
        "all_recipients": recipients,
    }


@router.put("/recipients/{site_code}")
async def update_report_recipients(
    site_code: str,
    update: RecipientsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update email recipients for a site."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_sites"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required to update recipients"
        )

    email_service = EmailService(db)
    success = email_service.update_site_recipients(
        site_code=site_code,
        director_email=update.director_email,
        gm_emails=update.gm_emails,
        report_recipients=update.report_recipients
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Site {site_code} not found"
        )

    return {
        "status": "success",
        "site_code": site_code,
        "message": "Recipients updated"
    }


@router.get("/email-status")
async def get_email_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if email is configured."""
    email_service = EmailService(db)

    return {
        "configured": email_service.is_configured(),
        "from_email": email_service.from_email if email_service.is_configured() else None,
    }


@router.post("/test-email")
async def send_test_email(
    recipient: str = Query(..., description="Email address to send test to"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a test email to verify configuration."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_settings"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required"
        )

    email_service = EmailService(db)

    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email not configured"
        )

    return email_service.send_test_email(recipient)
