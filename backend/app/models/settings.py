"""
System settings model for storing configuration.
Used for SOTI credentials, feature flags, etc.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Boolean

from app.core.database import Base


class SystemSettings(Base):
    """Key-value store for system settings."""
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    is_secret = Column(Boolean, default=False)  # If true, value is encrypted/hidden
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by = Column(String(100), nullable=True)
