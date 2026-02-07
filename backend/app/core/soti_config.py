"""
SOTI MobiControl configuration management.
Supports both environment variables and database-stored credentials.
"""
import os
from typing import Optional
from dataclasses import dataclass
from sqlalchemy.orm import Session


@dataclass
class SOTICredentials:
    """SOTI API credentials."""
    base_url: str
    client_id: str
    client_secret: str
    username: str
    password: str

    def is_valid(self) -> bool:
        """Check if all required fields are present."""
        return all([
            self.base_url,
            self.client_id,
            self.client_secret,
            self.username,
            self.password
        ])


class SOTIConfigManager:
    """
    Manages SOTI configuration from environment or database.

    Priority:
    1. Environment variables (for containerized deployments)
    2. Database settings (for UI-configured credentials)
    3. None (SOTI not configured - use manual imports)
    """

    # Environment variable names
    ENV_BASE_URL = "SOTI_BASE_URL"
    ENV_CLIENT_ID = "SOTI_CLIENT_ID"
    ENV_CLIENT_SECRET = "SOTI_CLIENT_SECRET"
    ENV_USERNAME = "SOTI_USERNAME"
    ENV_PASSWORD = "SOTI_PASSWORD"

    def __init__(self, db: Optional[Session] = None):
        self.db = db

    def get_credentials(self) -> Optional[SOTICredentials]:
        """
        Get SOTI credentials from available sources.
        Returns None if SOTI is not configured.
        """
        # Try environment variables first
        env_creds = self._get_from_env()
        if env_creds and env_creds.is_valid():
            return env_creds

        # Try database settings
        if self.db:
            db_creds = self._get_from_db()
            if db_creds and db_creds.is_valid():
                return db_creds

        return None

    def is_configured(self) -> bool:
        """Check if SOTI integration is configured."""
        creds = self.get_credentials()
        return creds is not None and creds.is_valid()

    def get_status(self) -> dict:
        """Get SOTI configuration status for UI."""
        creds = self.get_credentials()

        if not creds:
            return {
                "configured": False,
                "source": None,
                "message": "SOTI not configured. Use manual PBI imports or configure API credentials.",
                "base_url": None
            }

        if creds.is_valid():
            # Determine source
            env_creds = self._get_from_env()
            source = "environment" if (env_creds and env_creds.is_valid()) else "database"

            return {
                "configured": True,
                "source": source,
                "message": f"SOTI configured via {source} variables",
                "base_url": creds.base_url
            }

        return {
            "configured": False,
            "source": "partial",
            "message": "SOTI partially configured - missing required fields",
            "base_url": creds.base_url
        }

    def _get_from_env(self) -> Optional[SOTICredentials]:
        """Get credentials from environment variables."""
        base_url = os.getenv(self.ENV_BASE_URL)
        if not base_url:
            return None

        return SOTICredentials(
            base_url=base_url,
            client_id=os.getenv(self.ENV_CLIENT_ID, ""),
            client_secret=os.getenv(self.ENV_CLIENT_SECRET, ""),
            username=os.getenv(self.ENV_USERNAME, ""),
            password=os.getenv(self.ENV_PASSWORD, "")
        )

    def _get_from_db(self) -> Optional[SOTICredentials]:
        """Get credentials from database settings table."""
        if not self.db:
            return None

        try:
            from app.models.settings import SystemSettings

            def get_setting(key: str) -> Optional[str]:
                setting = self.db.query(SystemSettings).filter(
                    SystemSettings.key == key
                ).first()
                return setting.value if setting else None

            base_url = get_setting("soti_base_url")
            if not base_url:
                return None

            return SOTICredentials(
                base_url=base_url,
                client_id=get_setting("soti_client_id") or "",
                client_secret=get_setting("soti_client_secret") or "",
                username=get_setting("soti_username") or "",
                password=get_setting("soti_password") or ""
            )
        except Exception:
            # Settings table might not exist yet
            return None

    def save_credentials(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        username: str,
        password: str
    ) -> bool:
        """Save SOTI credentials to database."""
        if not self.db:
            return False

        try:
            from app.models.settings import SystemSettings

            settings = {
                "soti_base_url": base_url,
                "soti_client_id": client_id,
                "soti_client_secret": client_secret,
                "soti_username": username,
                "soti_password": password
            }

            for key, value in settings.items():
                existing = self.db.query(SystemSettings).filter(
                    SystemSettings.key == key
                ).first()

                if existing:
                    existing.value = value
                else:
                    self.db.add(SystemSettings(key=key, value=value))

            self.db.commit()
            return True
        except Exception:
            return False

    def clear_credentials(self) -> bool:
        """Clear SOTI credentials from database."""
        if not self.db:
            return False

        try:
            from app.models.settings import SystemSettings

            self.db.query(SystemSettings).filter(
                SystemSettings.key.like("soti_%")
            ).delete(synchronize_session=False)
            self.db.commit()
            return True
        except Exception:
            return False
