"""
IT Allocation models for monthly cost allocation data.
Tracks RF Hardware/Software devices with their GL strings.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class ITAllocationSnapshot(Base):
    """Monthly IT Allocation upload snapshot."""
    __tablename__ = "it_allocation_snapshots"

    snapshot_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    upload_timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    period = Column(Integer, nullable=False)  # Month (1-12)
    year = Column(Integer, nullable=False)
    file_name = Column(String(255))
    total_records = Column(Integer, default=0)
    rf_hardware_count = Column(Integer, default=0)
    rf_software_count = Column(Integer, default=0)
    uploaded_by = Column(String(36), ForeignKey("users.user_id"), nullable=True)

    # Relationships
    devices = relationship("ITAllocationDevice", back_populates="snapshot", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_it_allocation_period_year", "period", "year"),
    )


class ITAllocationDevice(Base):
    """
    RF Hardware/Software device from IT Allocation.
    Contains serial number (HSN), MAC address, and GL string for cost allocation.
    """
    __tablename__ = "it_allocation_devices"

    device_id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id = Column(String(36), ForeignKey("it_allocation_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)

    # Device identifiers
    hsn = Column(String(50), index=True)  # Hardware Serial Number
    mac_address = Column(String(20), index=True)
    device_model = Column(String(100))

    # Cost allocation
    gl_string = Column(String(50), nullable=False, index=True)
    category = Column(String(50), nullable=False)  # RF HARDWARE or RF SOFTWARE
    amount = Column(Float, default=0.0)

    # GL String components (parsed)
    gl_company = Column(String(10))      # dCO
    gl_cost_center = Column(String(10))  # dCC
    gl_cost_unit = Column(String(10))    # dCU
    gl_account = Column(String(10))      # dAC
    gl_activity = Column(String(10))     # dAT
    gl_sub_account = Column(String(10))  # dSA

    # Raw data preservation
    raw_detail1 = Column(Text)
    raw_detail2 = Column(Text)

    # Relationship
    snapshot = relationship("ITAllocationSnapshot", back_populates="devices")

    __table_args__ = (
        Index("idx_it_device_hsn_mac", "hsn", "mac_address"),
        Index("idx_it_device_snapshot_gl", "snapshot_id", "gl_string"),
    )


class SiteGLMapping(Base):
    """
    Maps sites to their expected GL strings.
    Used to validate audit findings against expected cost allocation.
    """
    __tablename__ = "site_gl_mappings"

    mapping_id = Column(Integer, primary_key=True, autoincrement=True)
    site_code = Column(String(20), ForeignKey("sites.site_code", ondelete="CASCADE"), nullable=False, index=True)
    gl_string = Column(String(50), nullable=False)
    category = Column(String(50))  # RF HARDWARE, RF SOFTWARE, etc.
    is_primary = Column(Integer, default=1)  # 1 = primary GL for this site/category
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_site_gl_mapping", "site_code", "gl_string", "category"),
    )
