"""
PBI/SOTI connection status models.
Tracks device connectivity from Power BI / SOTI MDM exports.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class PBISnapshot(Base):
    """Monthly PBI/SOTI connection status upload snapshot."""
    __tablename__ = "pbi_snapshots"

    snapshot_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    site_code = Column(String(20), ForeignKey("sites.site_code", ondelete="CASCADE"), nullable=False, index=True)
    upload_timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    period = Column(Integer, nullable=False)  # Month (1-12)
    year = Column(Integer, nullable=False)
    file_name = Column(String(255))
    total_records = Column(Integer, default=0)
    connected_count = Column(Integer, default=0)
    disconnected_count = Column(Integer, default=0)
    inactive_threshold_days = Column(Integer, default=30)
    uploaded_by = Column(String(36), ForeignKey("users.user_id"), nullable=True)

    # Relationships
    devices = relationship("PBIDevice", back_populates="snapshot", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_pbi_snapshot_site_period", "site_code", "period", "year"),
    )


class PBIDevice(Base):
    """
    Individual device connection status from PBI/SOTI export.
    Tracks whether device has connected within threshold period.
    """
    __tablename__ = "pbi_devices"

    device_id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id = Column(String(36), ForeignKey("pbi_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)

    # Device identifiers
    serial_number = Column(String(50), nullable=False, index=True)
    model = Column(String(100))

    # Connection status
    connection_status = Column(String(100))  # Raw status text from import
    is_connected = Column(Boolean, default=False)  # Parsed: True if connected within threshold
    days_since_connect = Column(Integer, nullable=True)  # Extracted from status or calculated

    # Justification for inactive devices
    justification = Column(Text)  # User-provided explanation
    ticket_number = Column(String(50))  # Related IT ticket if any
    justification_date = Column(DateTime, nullable=True)
    justified_by = Column(String(36), ForeignKey("users.user_id"), nullable=True)

    # Relationship
    snapshot = relationship("PBISnapshot", back_populates="devices")

    __table_args__ = (
        Index("idx_pbi_device_serial", "serial_number"),
        Index("idx_pbi_device_snapshot", "snapshot_id"),
    )
