"""
Audit submission and detail models.

Critical Design Decision:
- audit_details allows duplicate serials with a flag for detection
- Validation warnings stored separately from hard errors
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Date, DateTime, Text, Boolean, ForeignKey, Enum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    COMPLETED_WITH_WARNINGS = "completed_with_warnings"
    ERROR = "error"


class AuditSubmission(Base):
    __tablename__ = "audit_submissions"

    audit_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_code = Column(String(20), ForeignKey("sites.site_code"), nullable=False, index=True)
    audit_date = Column(Date, nullable=False)
    auditor_name = Column(String(100), nullable=False)
    upload_timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    file_name = Column(String(255))
    total_assets_found = Column(Integer, default=0)
    processing_status = Column(Enum(ProcessingStatus), default=ProcessingStatus.PENDING)
    error_message = Column(Text, nullable=True)
    warning_count = Column(Integer, default=0)  # Track validation warnings

    # Relationships
    details = relationship("AuditDetail", back_populates="audit", cascade="all, delete-orphan")
    variances = relationship("Variance", back_populates="audit", cascade="all, delete-orphan")

    __table_args__ = (
        # Allow re-uploads for same site/date (removes unique constraint)
        # Instead, we track the latest audit per site/date
        Index("idx_audit_site_date", "site_code", "audit_date"),
    )


class AuditDetail(Base):
    __tablename__ = "audit_details"

    detail_id = Column(Integer, primary_key=True, autoincrement=True)
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audit_submissions.audit_id", ondelete="CASCADE"), nullable=False, index=True)
    row_number = Column(Integer)  # Original row in uploaded file
    serial_number = Column(String(50), nullable=False, index=True)
    asset_type = Column(String(50), nullable=False)
    model = Column(String(50), nullable=False)
    physical_condition = Column(String(20), nullable=False)  # Good/Bad/RMA/Lost
    location_notes = Column(Text, nullable=True)

    # Critical fix: Flag for duplicate detection instead of unique constraint
    is_duplicate = Column(Boolean, default=False)
    duplicate_of_row = Column(Integer, nullable=True)

    # Relationship
    audit = relationship("AuditSubmission", back_populates="details")

    __table_args__ = (
        Index("idx_audit_details_audit_serial", "audit_id", "serial_number"),
    )
