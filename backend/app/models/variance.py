"""
Variance and action item models for reconciliation results.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text, Numeric, ForeignKey, Enum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class VarianceType(str, enum.Enum):
    CORRECT = "CORRECT"  # Found on-site, correct GL
    MISALLOCATED = "MISALLOCATED"  # Found on-site, wrong GL
    UNTRACKED = "UNTRACKED"  # Found on-site, not in master DB
    MISSING = "MISSING"  # In GL, not found on-site
    CONDITION_MISMATCH = "CONDITION_MISMATCH"  # Condition differs
    MDM_NOT_ENROLLED = "MDM_NOT_ENROLLED"  # Not in MDM
    MDM_INACTIVE_WARNING = "MDM_INACTIVE_WARNING"  # Approaching 60-day limit
    DUPLICATE_IN_AUDIT = "DUPLICATE_IN_AUDIT"  # Critical fix: track duplicate serials in audit


class PriorityLevel(str, enum.Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class ActionStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Variance(Base):
    __tablename__ = "variances"

    variance_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audit_submissions.audit_id", ondelete="CASCADE"), nullable=False, index=True)
    serial_number = Column(String(50), nullable=True, index=True)
    variance_type = Column(Enum(VarianceType), nullable=False, index=True)
    priority = Column(Enum(PriorityLevel), nullable=False, index=True)

    # Context fields
    current_gl_site = Column(String(20), nullable=True)  # Where GL says it is
    physical_site = Column(String(20), nullable=True)  # Where it actually is
    master_condition = Column(String(20), nullable=True)
    physical_condition = Column(String(20), nullable=True)
    asset_type = Column(String(50), nullable=True)
    model = Column(String(50), nullable=True)

    # Financial impact
    monthly_cost_impact = Column(Numeric(10, 2), nullable=True)

    # Action required
    action_required = Column(Text, nullable=True)
    recommended_action = Column(Text, nullable=True)
    email_template = Column(Text, nullable=True)

    # Tracking
    status = Column(Enum(ActionStatus), default=ActionStatus.PENDING, index=True)
    assigned_to = Column(String(100), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationship
    audit = relationship("AuditSubmission", back_populates="variances")

    __table_args__ = (
        Index("idx_variance_audit_type", "audit_id", "variance_type"),
        Index("idx_variance_status_priority", "status", "priority"),
    )
