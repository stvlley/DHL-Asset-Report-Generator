"""
User model for authentication and authorization.
"""
import uuid
import json
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Enum, Text
import enum

from app.core.database import Base


class UserRole(str, enum.Enum):
    # Primary roles
    ADMIN = "admin"
    SUPER_USER = "super_user"  # Site systems member - manages data, approves audits
    AUDITOR = "auditor"        # Site personnel - scans assets, reviews variances

    # Deprecated roles (kept for migration compatibility)
    SITE_OPERATIONS = "site_operations"    # Maps to AUDITOR
    SITE_MANAGER = "site_manager"          # Maps to SUPER_USER
    REGIONAL_DIRECTOR = "regional_director"  # Maps to SUPER_USER


class User(Base):
    __tablename__ = "users"

    user_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)  # NULL if SSO only
    full_name = Column(String(100))
    role = Column(Enum(UserRole), nullable=False, default=UserRole.AUDITOR)
    # Store as JSON string for SQLite compatibility
    _assigned_sites = Column("assigned_sites", Text, default="[]")
    assigned_region = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)

    # Security tracking
    failed_login_attempts = Column(String(10), default="0")
    locked_until = Column(DateTime, nullable=True)
    password_changed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime, nullable=True)

    @property
    def assigned_sites(self):
        """Get assigned sites as a list."""
        if self._assigned_sites:
            try:
                return json.loads(self._assigned_sites)
            except (json.JSONDecodeError, TypeError):
                return []
        return []

    @assigned_sites.setter
    def assigned_sites(self, value):
        """Set assigned sites from a list."""
        if value is None:
            self._assigned_sites = "[]"
        elif isinstance(value, list):
            self._assigned_sites = json.dumps(value)
        else:
            self._assigned_sites = value

    def is_locked(self) -> bool:
        """Check if account is currently locked."""
        if self.locked_until is None:
            return False
        return datetime.now(timezone.utc) < self.locked_until

    def increment_failed_attempts(self) -> int:
        """Increment failed login attempts and return new count."""
        current = int(self.failed_login_attempts or "0")
        current += 1
        self.failed_login_attempts = str(current)
        return current

    def reset_failed_attempts(self):
        """Reset failed login attempts after successful login."""
        self.failed_login_attempts = "0"
        self.locked_until = None
