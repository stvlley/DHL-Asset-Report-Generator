"""
Application settings model for configurable system parameters.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey

from app.core.database import Base


class AppSettings(Base):
    """
    Application-wide configurable settings.
    Stores key-value pairs for system configuration.
    """
    __tablename__ = "app_settings"

    setting_key = Column(String(100), primary_key=True)
    setting_value = Column(Text, nullable=False)
    description = Column(Text)
    setting_type = Column(String(20), default="string")  # string, integer, boolean, json
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by = Column(String(36), ForeignKey("users.user_id"), nullable=True)


# Default settings to be seeded
DEFAULT_SETTINGS = [
    {
        "setting_key": "inactive_threshold_days",
        "setting_value": "30",
        "description": "Number of days of inactivity before a device is considered inactive",
        "setting_type": "integer"
    },
    {
        "setting_key": "report_due_day",
        "setting_value": "friday",
        "description": "Day of week when monthly reports are due",
        "setting_type": "string"
    },
    {
        "setting_key": "report_due_week",
        "setting_value": "1",
        "description": "Week of month when reports are due (1 = first week)",
        "setting_type": "integer"
    },
    {
        "setting_key": "internal_review_days_before",
        "setting_value": "1",
        "description": "Days before report deadline for internal review",
        "setting_type": "integer"
    },
]
