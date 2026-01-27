"""
Audit log model for compliance tracking.
"""
import json
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index, Text

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    user_id = Column(String(36), ForeignKey("users.user_id"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(50), nullable=True)  # 'audit', 'asset', 'variance', etc.
    resource_id = Column(String(100), nullable=True)
    _details = Column("details", Text, nullable=True)  # JSON stored as text
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6

    @property
    def details(self):
        if self._details:
            try:
                return json.loads(self._details)
            except (json.JSONDecodeError, TypeError):
                return None
        return None

    @details.setter
    def details(self, value):
        if value is None:
            self._details = None
        elif isinstance(value, dict):
            self._details = json.dumps(value)
        else:
            self._details = value

    __table_args__ = (
        Index("idx_audit_log_user_action", "user_id", "action"),
        Index("idx_audit_log_resource", "resource_type", "resource_id"),
    )
