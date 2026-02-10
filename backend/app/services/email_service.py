"""
Email service for sending audit reports.
"""
import os
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.site import Site
from app.core.config import settings


class EmailService:
    """Service for sending audit reports via email."""

    def __init__(self, db: Session):
        self.db = db
        self.smtp_host = getattr(settings, 'SMTP_HOST', '') or os.environ.get('SMTP_HOST', '')
        self.smtp_port = int(getattr(settings, 'SMTP_PORT', 587) or os.environ.get('SMTP_PORT', 587))
        self.smtp_user = getattr(settings, 'SMTP_USER', '') or os.environ.get('SMTP_USER', '')
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', '') or os.environ.get('SMTP_PASSWORD', '')
        self.from_email = getattr(settings, 'SMTP_FROM_EMAIL', '') or os.environ.get('SMTP_FROM_EMAIL', '')
        self.use_tls = getattr(settings, 'SMTP_USE_TLS', True)

    def is_configured(self) -> bool:
        """Check if email is properly configured."""
        return bool(self.smtp_host and self.smtp_user and self.from_email)

    def get_site_recipients(self, site_code: str) -> List[str]:
        """
        Get configured email recipients for a site.

        Returns combined list of director, GMs, and additional recipients.
        """
        site = self.db.query(Site).filter(Site.site_code == site_code).first()
        if not site:
            return []

        recipients = []

        # Add director email
        if site.director_email:
            recipients.append(site.director_email)

        # Add GM emails (stored as JSON array)
        if site.gm_emails:
            try:
                gm_list = json.loads(site.gm_emails)
                if isinstance(gm_list, list):
                    recipients.extend(gm_list)
            except json.JSONDecodeError:
                pass

        # Add additional recipients
        if site.report_recipients:
            try:
                extra_list = json.loads(site.report_recipients)
                if isinstance(extra_list, list):
                    recipients.extend(extra_list)
            except json.JSONDecodeError:
                pass

        # Remove duplicates while preserving order
        seen = set()
        unique_recipients = []
        for r in recipients:
            if r and r not in seen:
                seen.add(r)
                unique_recipients.append(r)

        return unique_recipients

    def update_site_recipients(
        self,
        site_code: str,
        director_email: Optional[str] = None,
        gm_emails: Optional[List[str]] = None,
        report_recipients: Optional[List[str]] = None
    ) -> bool:
        """
        Update email recipients for a site.

        Args:
            site_code: Site to update
            director_email: Director's email address
            gm_emails: List of GM email addresses
            report_recipients: List of additional recipients

        Returns:
            True if updated successfully
        """
        site = self.db.query(Site).filter(Site.site_code == site_code).first()
        if not site:
            return False

        if director_email is not None:
            site.director_email = director_email

        if gm_emails is not None:
            site.gm_emails = json.dumps(gm_emails)

        if report_recipients is not None:
            site.report_recipients = json.dumps(report_recipients)

        self.db.commit()
        return True

    def send_report(
        self,
        site_code: str,
        recipients: Optional[List[str]] = None,
        attachment_path: Optional[str] = None,
        subject: Optional[str] = None,
        body: Optional[str] = None,
        period: Optional[str] = None
    ) -> dict:
        """
        Send an audit report email.

        Args:
            site_code: Site code for the report
            recipients: Override recipients (uses site config if not provided)
            attachment_path: Path to the Excel report file
            subject: Email subject (auto-generated if not provided)
            body: Email body (auto-generated if not provided)
            period: Report period (e.g., "January 2026")

        Returns:
            Dict with status and details
        """
        if not self.is_configured():
            return {
                "status": "error",
                "message": "Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL.",
                "sent": False
            }

        # Get recipients
        if not recipients:
            recipients = self.get_site_recipients(site_code)

        if not recipients:
            return {
                "status": "error",
                "message": f"No recipients configured for site {site_code}",
                "sent": False
            }

        # Get site info
        site = self.db.query(Site).filter(Site.site_code == site_code).first()
        site_name = site.site_name if site else site_code

        # Generate default subject and body
        if not subject:
            subject = f"Asset Audit Report - {site_name} ({site_code})"
            if period:
                subject = f"Asset Audit Report - {site_name} ({site_code}) - {period}"

        if not body:
            body = f"""Please find attached the monthly asset audit report for {site_name} ({site_code}).

This report includes:
- Total asset count on site
- Variance analysis vs IT Allocation
- Variance analysis vs SOTI/PBI
- Inactive device summary

Please review and address any action items as needed.

This is an automated message from the DHL Asset Audit Tool.
"""

        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.from_email
            msg['To'] = ', '.join(recipients)
            msg['Subject'] = subject

            # Attach body
            msg.attach(MIMEText(body, 'plain'))

            # Attach file if provided
            if attachment_path and os.path.exists(attachment_path):
                with open(attachment_path, 'rb') as f:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(f.read())
                    encoders.encode_base64(part)
                    filename = os.path.basename(attachment_path)
                    part.add_header(
                        'Content-Disposition',
                        f'attachment; filename="{filename}"'
                    )
                    msg.attach(part)

            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)

            return {
                "status": "success",
                "message": f"Report sent to {len(recipients)} recipient(s)",
                "sent": True,
                "recipients": recipients
            }

        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to send email: {str(e)}",
                "sent": False,
                "error": str(e)
            }

    def send_test_email(self, recipient: str) -> dict:
        """
        Send a test email to verify configuration.

        Args:
            recipient: Email address to send test to

        Returns:
            Dict with status
        """
        return self.send_report(
            site_code="TEST",
            recipients=[recipient],
            subject="DHL Asset Audit Tool - Test Email",
            body="This is a test email from the DHL Asset Audit Tool. If you received this, email is configured correctly."
        )
