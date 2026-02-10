#!/usr/bin/env python3
"""
Migration script to add PBI, app_settings tables and new Site columns.
Run from backend directory: python scripts/migrate_add_pbi_settings.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine
from sqlalchemy import text


def run_migration():
    """Run database migration for new tables and columns."""

    with engine.connect() as conn:
        # Add new columns to sites table
        site_columns = [
            ("director_email", "VARCHAR(255)"),
            ("gm_emails", "TEXT"),
            ("report_recipients", "TEXT"),
        ]

        for col_name, col_type in site_columns:
            try:
                conn.execute(text(f"ALTER TABLE sites ADD COLUMN {col_name} {col_type}"))
                print(f"Added column sites.{col_name}")
            except Exception as e:
                if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                    print(f"Column sites.{col_name} already exists, skipping...")
                else:
                    print(f"Note: {col_name}: {e}")

        # Create app_settings table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    setting_key VARCHAR(100) PRIMARY KEY,
                    setting_value TEXT NOT NULL,
                    description TEXT,
                    setting_type VARCHAR(20) DEFAULT 'string',
                    updated_at DATETIME,
                    updated_by VARCHAR(36) REFERENCES users(user_id)
                )
            """))
            print("Created table: app_settings")
        except Exception as e:
            print(f"app_settings table: {e}")

        # Create pbi_snapshots table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pbi_snapshots (
                    snapshot_id VARCHAR(36) PRIMARY KEY,
                    site_code VARCHAR(20) NOT NULL REFERENCES sites(site_code),
                    period INTEGER NOT NULL,
                    year INTEGER NOT NULL,
                    upload_timestamp DATETIME,
                    file_name VARCHAR(255),
                    total_records INTEGER DEFAULT 0,
                    connected_count INTEGER DEFAULT 0,
                    disconnected_count INTEGER DEFAULT 0,
                    inactive_threshold_days INTEGER DEFAULT 30,
                    uploaded_by VARCHAR(36) REFERENCES users(user_id),
                    UNIQUE(site_code, period, year)
                )
            """))
            print("Created table: pbi_snapshots")
        except Exception as e:
            print(f"pbi_snapshots table: {e}")

        # Create pbi_devices table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pbi_devices (
                    device_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    snapshot_id VARCHAR(36) NOT NULL REFERENCES pbi_snapshots(snapshot_id),
                    serial_number VARCHAR(50) NOT NULL,
                    model VARCHAR(100),
                    is_connected BOOLEAN DEFAULT 0,
                    days_since_connect INTEGER,
                    last_connection_date DATETIME,
                    justification TEXT,
                    ticket_number VARCHAR(50),
                    justification_date DATETIME,
                    justification_by VARCHAR(36) REFERENCES users(user_id)
                )
            """))
            print("Created table: pbi_devices")
        except Exception as e:
            print(f"pbi_devices table: {e}")

        # Create index on pbi_devices
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_pbi_devices_serial
                ON pbi_devices(serial_number)
            """))
            print("Created index: ix_pbi_devices_serial")
        except Exception as e:
            print(f"Index creation: {e}")

        conn.commit()
        print("\nMigration complete!")


if __name__ == "__main__":
    run_migration()
