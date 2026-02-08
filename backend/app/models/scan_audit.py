"""
Scan Audit models for physical inventory scanning workflow.

Tracks scan sessions and individual scan results with real-time lookup
and condition recording.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Integer, ForeignKey, Text, Index
import enum

from app.core.database import Base


class ScanStatus(str, enum.Enum):
    """Status of a scanned item."""
    FOUND = "found"              # Asset found in master data
    NOT_TRACKED = "not_tracked"  # Asset not in master data (new/unknown)
    DUPLICATE = "duplicate"      # Already scanned in this session


class ScanSession(Base):
    """A physical audit scanning session."""
    __tablename__ = "scan_sessions"

    session_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    site_code = Column(String(20), ForeignKey("sites.site_code"), nullable=False, index=True)

    # Session metadata
    session_name = Column(String(100), nullable=True)  # e.g., "January 2026 Audit"
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

    # Auditor info
    auditor_name = Column(String(100), nullable=True)
    auditor_user_id = Column(String(36), ForeignKey("users.user_id"), nullable=True)

    # Stats (denormalized for quick access)
    total_scanned = Column(Integer, default=0)
    found_count = Column(Integer, default=0)
    not_tracked_count = Column(Integer, default=0)
    good_count = Column(Integer, default=0)
    bad_count = Column(Integer, default=0)

    # Expected count from master data at session start
    expected_count = Column(Integer, default=0)

    notes = Column(Text, nullable=True)

    __table_args__ = (
        Index("idx_scan_session_site_active", "site_code", "is_active"),
    )


class ScanResult(Base):
    """Individual scan result within a session."""
    __tablename__ = "scan_results"

    result_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("scan_sessions.session_id"), nullable=False, index=True)

    # What was scanned
    scanned_value = Column(String(100), nullable=False)  # The barcode/serial scanned
    scanned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Lookup result
    scan_status = Column(String(20), default=ScanStatus.NOT_TRACKED.value)
    asset_id = Column(String(36), ForeignKey("assets_master.asset_id"), nullable=True)  # If found

    # Data from master (cached at scan time)
    master_serial = Column(String(50), nullable=True)
    master_model = Column(String(100), nullable=True)
    master_asset_type = Column(String(50), nullable=True)
    master_condition = Column(String(20), nullable=True)  # Previous condition from master

    # User input
    recorded_condition = Column(String(20), nullable=True)  # G=Good, B=Bad
    condition_confirmed_at = Column(DateTime, nullable=True)
    location = Column(String(100), nullable=True)  # Optional location within site
    notes = Column(Text, nullable=True)

    __table_args__ = (
        Index("idx_scan_result_session", "session_id", "scanned_at"),
        Index("idx_scan_result_asset", "asset_id"),
        Index("idx_scan_result_value", "scanned_value"),
    )
