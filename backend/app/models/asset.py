"""
Asset master model for corporate asset database.

Critical Design Decision:
- Using composite primary key (serial_number + assigned_site_code) to handle
  edge case where same serial might exist in different accounts/sites
- Added asset_id as a surrogate key for references
- Soft delete support via is_deleted flag
- MDM/SOTI integration for device connectivity tracking
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Date, DateTime, Numeric, Boolean, Integer, Index, ForeignKey, Text
import enum

from app.core.database import Base


class AssetSource(str, enum.Enum):
    """Source of asset record."""
    IT_ALLOCATION = "it_allocation"
    MANUAL = "manual"
    PHYSICAL_AUDIT = "physical_audit"
    MDM_SYNC = "mdm_sync"


class MDMEnrollmentStatus(str, enum.Enum):
    """MDM enrollment status."""
    NOT_ENROLLED = "not_enrolled"
    ENROLLED = "enrolled"
    PENDING = "pending"
    UNENROLLED = "unenrolled"
    UNKNOWN = "unknown"


class AssetMaster(Base):
    __tablename__ = "assets_master"

    # Surrogate primary key for easier references
    asset_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Natural key components
    serial_number = Column(String(50), nullable=False, index=True)
    assigned_site_code = Column(String(20), ForeignKey("sites.site_code"), nullable=False, index=True)

    # Asset identifiers (multiple ways to identify a device)
    hsn = Column(String(50), nullable=True, index=True)  # Hardware Serial Number from IT Allocation
    mac_address = Column(String(50), nullable=True, index=True)
    imei = Column(String(20), nullable=True)  # For cellular devices
    mdm_device_id = Column(String(100), nullable=True, index=True)  # SOTI device ID

    # Asset details
    asset_type = Column(String(50), nullable=False)
    model = Column(String(100), nullable=False)
    manufacturer = Column(String(100), nullable=True)
    gl_string = Column(String(100), nullable=False, index=True)
    acquisition_date = Column(Date, nullable=True)
    recorded_condition = Column(String(20), nullable=True)  # Good/Bad/RMA/Lost
    cost_per_month = Column(Numeric(10, 2), nullable=True)

    # Source tracking
    source = Column(String(20), default=AssetSource.MANUAL.value)
    it_allocation_snapshot_id = Column(String(36), nullable=True)  # Link to source snapshot

    # MDM/SOTI integration fields
    mdm_enrollment_status = Column(String(20), default=MDMEnrollmentStatus.UNKNOWN.value)
    mdm_last_seen = Column(DateTime, nullable=True)
    mdm_last_sync = Column(DateTime, nullable=True)  # When we last synced with SOTI
    mdm_days_since_connect = Column(Integer, nullable=True)
    mdm_os_version = Column(String(50), nullable=True)
    mdm_agent_version = Column(String(50), nullable=True)
    mdm_battery_level = Column(Integer, nullable=True)
    mdm_compliance_status = Column(String(50), nullable=True)
    mdm_device_name = Column(String(100), nullable=True)
    mdm_raw_data = Column(Text, nullable=True)  # JSON blob of full SOTI response

    # Soft delete support - critical fix
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(String(100), nullable=True)

    # Transfer tracking
    previous_site_code = Column(String(20), nullable=True)
    transfer_date = Column(DateTime, nullable=True)
    transfer_notes = Column(Text, nullable=True)

    # Audit trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    # Unique constraint on serial + site combination
    __table_args__ = (
        Index("idx_assets_serial_site", "serial_number", "assigned_site_code", unique=True),
        Index("idx_assets_active", "is_deleted", "assigned_site_code"),
        Index("idx_assets_hsn", "hsn"),
        Index("idx_assets_mac", "mac_address"),
        Index("idx_assets_mdm_device", "mdm_device_id"),
        Index("idx_assets_mdm_status", "mdm_enrollment_status", "mdm_days_since_connect"),
    )
