#!/usr/bin/env python3
"""
Seed script to add KLS Philadelphia site to the database.
Run from backend directory: python scripts/seed_kls_philadelphia.py
"""
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine, Base, SessionLocal
# Import all models to register them with Base.metadata
from app.models import (  # noqa: F401
    User, Site, AssetMaster, AuditSubmission, AuditDetail,
    MDMSnapshot, MDMDetail, Variance, AuditLog,
    ITAllocationSnapshot, ITAllocationDevice, SiteGLMapping,
    ScanSession, ScanResult, PBISnapshot, PBIDevice, AppSettings
)
from app.models.app_settings import DEFAULT_SETTINGS


def seed_database():
    """Seed the database with initial data."""
    # Create all tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if KLS Philadelphia already exists
        existing_site = db.query(Site).filter(Site.site_code == "KLSPHILA").first()

        if existing_site:
            print(f"Site 'KLS Philadelphia' (KLSPHILA) already exists, skipping...")
        else:
            # Create KLS Philadelphia site
            kls_phila = Site(
                site_code="KLSPHILA",
                site_name="KLS Philadelphia",
                account_name="KLS Systems",
                region="Northeast",
                address="Philadelphia, PA",
                city="Philadelphia",
                state="PA",
                country="US",
                is_active=True,
            )
            db.add(kls_phila)
            print(f"Created site: KLS Philadelphia (KLSPHILA)")

        # Seed default app settings
        for setting in DEFAULT_SETTINGS:
            existing = db.query(AppSettings).filter(
                AppSettings.setting_key == setting["setting_key"]
            ).first()

            if not existing:
                app_setting = AppSettings(
                    setting_key=setting["setting_key"],
                    setting_value=setting["setting_value"],
                    setting_type=setting["setting_type"],
                    description=setting["description"],
                )
                db.add(app_setting)
                print(f"Created setting: {setting['setting_key']} = {setting['setting_value']}")
            else:
                print(f"Setting '{setting['setting_key']}' already exists, skipping...")

        db.commit()
        print("\nDatabase seeding complete!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
