"""
Application settings service for managing configurable parameters.
"""
from typing import Optional, Any
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.app_settings import AppSettings, DEFAULT_SETTINGS


class AppSettingsService:
    """Service for managing application settings."""

    def __init__(self, db: Session):
        self.db = db

    def get_setting(self, key: str, default: Any = None) -> Any:
        """
        Get a setting value by key.

        Args:
            key: Setting key name
            default: Default value if not found

        Returns:
            Setting value (converted to appropriate type)
        """
        setting = self.db.query(AppSettings).filter(
            AppSettings.setting_key == key
        ).first()

        if not setting:
            return default

        return self._convert_value(setting.setting_value, setting.setting_type)

    def set_setting(
        self,
        key: str,
        value: Any,
        user_id: Optional[str] = None,
        description: Optional[str] = None,
        setting_type: str = "string"
    ) -> AppSettings:
        """
        Set a setting value.

        Args:
            key: Setting key name
            value: Setting value
            user_id: User making the change
            description: Optional description
            setting_type: Type hint (string, integer, boolean, json)

        Returns:
            Updated or created AppSettings record
        """
        setting = self.db.query(AppSettings).filter(
            AppSettings.setting_key == key
        ).first()

        if setting:
            setting.setting_value = str(value)
            setting.updated_at = datetime.now(timezone.utc)
            setting.updated_by = user_id
            if description:
                setting.description = description
        else:
            setting = AppSettings(
                setting_key=key,
                setting_value=str(value),
                description=description or "",
                setting_type=setting_type,
                updated_by=user_id
            )
            self.db.add(setting)

        self.db.commit()
        return setting

    def get_inactive_threshold(self) -> int:
        """Get the inactive device threshold in days."""
        return int(self.get_setting("inactive_threshold_days", 30))

    def set_inactive_threshold(self, days: int, user_id: Optional[str] = None) -> AppSettings:
        """Set the inactive device threshold."""
        return self.set_setting(
            "inactive_threshold_days",
            days,
            user_id=user_id,
            description="Number of days of inactivity before a device is considered inactive",
            setting_type="integer"
        )

    def get_report_due_day(self) -> str:
        """Get the day of week when reports are due."""
        return self.get_setting("report_due_day", "friday")

    def get_report_due_week(self) -> int:
        """Get the week of month when reports are due (1 = first)."""
        return int(self.get_setting("report_due_week", 1))

    def get_internal_review_days(self) -> int:
        """Get days before deadline for internal review."""
        return int(self.get_setting("internal_review_days_before", 1))

    def get_all_settings(self) -> list:
        """Get all settings as a list of dicts."""
        settings = self.db.query(AppSettings).all()
        return [
            {
                "key": s.setting_key,
                "value": self._convert_value(s.setting_value, s.setting_type),
                "raw_value": s.setting_value,
                "type": s.setting_type,
                "description": s.description,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None
            }
            for s in settings
        ]

    def seed_defaults(self) -> int:
        """
        Seed default settings if they don't exist.

        Returns:
            Number of settings created
        """
        created = 0
        for default in DEFAULT_SETTINGS:
            existing = self.db.query(AppSettings).filter(
                AppSettings.setting_key == default["setting_key"]
            ).first()

            if not existing:
                setting = AppSettings(
                    setting_key=default["setting_key"],
                    setting_value=default["setting_value"],
                    description=default.get("description", ""),
                    setting_type=default.get("setting_type", "string")
                )
                self.db.add(setting)
                created += 1

        if created > 0:
            self.db.commit()

        return created

    def _convert_value(self, value: str, value_type: str) -> Any:
        """Convert string value to appropriate type."""
        if not value:
            return None

        if value_type == "integer":
            return int(value)
        elif value_type == "boolean":
            return value.lower() in ("true", "1", "yes")
        elif value_type == "json":
            import json
            return json.loads(value)
        else:
            return value
