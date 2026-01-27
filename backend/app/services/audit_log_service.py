"""
Audit logging service for compliance tracking.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


class AuditLogService:
    """Service for logging user actions for compliance."""

    def __init__(self, db: Session):
        self.db = db

    def log_action(
        self,
        action: str,
        user_id: Optional[UUID] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None
    ):
        """Log a user action."""
        log_entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )
        self.db.add(log_entry)
        self.db.commit()

    def log_login(self, user_id: UUID, success: bool, ip_address: Optional[str] = None):
        """Log login attempt."""
        self.log_action(
            action="login_success" if success else "login_failed",
            user_id=user_id if success else None,
            details={"user_id": str(user_id)} if not success else None,
            ip_address=ip_address,
        )

    def log_audit_upload(
        self,
        user_id: UUID,
        audit_id: UUID,
        site_code: str,
        ip_address: Optional[str] = None
    ):
        """Log audit upload."""
        self.log_action(
            action="upload_audit",
            user_id=user_id,
            resource_type="audit",
            resource_id=str(audit_id),
            details={"site_code": site_code},
            ip_address=ip_address,
        )

    def log_master_data_upload(
        self,
        user_id: UUID,
        records_created: int,
        records_updated: int,
        ip_address: Optional[str] = None
    ):
        """Log master data upload."""
        self.log_action(
            action="upload_master_data",
            user_id=user_id,
            resource_type="master_data",
            details={
                "records_created": records_created,
                "records_updated": records_updated,
            },
            ip_address=ip_address,
        )

    def log_variance_update(
        self,
        user_id: UUID,
        variance_id: UUID,
        old_status: str,
        new_status: str,
        ip_address: Optional[str] = None
    ):
        """Log variance status update."""
        self.log_action(
            action="update_variance",
            user_id=user_id,
            resource_type="variance",
            resource_id=str(variance_id),
            details={
                "old_status": old_status,
                "new_status": new_status,
            },
            ip_address=ip_address,
        )

    def log_user_management(
        self,
        admin_user_id: UUID,
        target_user_id: UUID,
        action: str,
        details: Optional[Dict] = None,
        ip_address: Optional[str] = None
    ):
        """Log user management action."""
        self.log_action(
            action=f"user_{action}",
            user_id=admin_user_id,
            resource_type="user",
            resource_id=str(target_user_id),
            details=details,
            ip_address=ip_address,
        )

    def get_logs(
        self,
        user_id: Optional[UUID] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ):
        """Get audit logs with optional filters."""
        query = self.db.query(AuditLog)

        if user_id:
            query = query.filter(AuditLog.user_id == user_id)
        if action:
            query = query.filter(AuditLog.action == action)
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)

        return query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
