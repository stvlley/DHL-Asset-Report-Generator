"""
MDM (Mobile Device Management) data models for optional enrichment.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Date, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class MDMSnapshot(Base):
    __tablename__ = "mdm_snapshots"

    snapshot_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audit_submissions.audit_id", ondelete="CASCADE"), nullable=True, index=True)
    upload_timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    file_name = Column(String(255))
    total_records = Column(Integer, default=0)

    # Relationships
    details = relationship("MDMDetail", back_populates="snapshot", cascade="all, delete-orphan")


class MDMDetail(Base):
    __tablename__ = "mdm_details"

    mdm_id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id = Column(UUID(as_uuid=True), ForeignKey("mdm_snapshots.snapshot_id", ondelete="CASCADE"), nullable=False, index=True)
    serial_number = Column(String(50), nullable=False, index=True)
    connection_status = Column(String(50))  # "Connected in last 60 days", "Not connected", etc.
    last_seen_date = Column(Date, nullable=True)
    days_inactive = Column(Integer, nullable=True)
    device_name = Column(String(100), nullable=True)
    enrollment_status = Column(String(50), nullable=True)

    # Relationship
    snapshot = relationship("MDMSnapshot", back_populates="details")

    __table_args__ = (
        Index("idx_mdm_snapshot_serial", "snapshot_id", "serial_number"),
    )
