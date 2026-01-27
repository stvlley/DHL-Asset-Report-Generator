"""
User model for authentication and authorization.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Enum, ARRAY
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.core.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    SITE_OPERATIONS = "site_operations"
    SITE_MANAGER = "site_manager"
    REGIONAL_DIRECTOR = "regional_director"


class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)  # NULL if SSO only
    full_name = Column(String(100))
    role = Column(Enum(UserRole), nullable=False, default=UserRole.SITE_OPERATIONS)
    assigned_sites = Column(ARRAY(String), default=[])
    assigned_region = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)

    # Security tracking
    failed_login_attempts = Column(String(10), default="0")  # Stored as string for simplicity
    locked_until = Column(DateTime(timezone=True), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime(timezone=True), nullable=True)

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
