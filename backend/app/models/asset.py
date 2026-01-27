"""
Asset master model for corporate asset database.

Critical Design Decision:
- Using composite primary key (serial_number + assigned_site_code) to handle
  edge case where same serial might exist in different accounts/sites
- Added asset_id as a surrogate key for references
- Soft delete support via is_deleted flag
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Date, DateTime, Numeric, Boolean, Index, ForeignKey

from app.core.database import Base


class AssetMaster(Base):
    __tablename__ = "assets_master"

    # Surrogate primary key for easier references
    asset_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Natural key components
    serial_number = Column(String(50), nullable=False, index=True)
    assigned_site_code = Column(String(20), ForeignKey("sites.site_code"), nullable=False, index=True)

    # Asset details
    asset_type = Column(String(50), nullable=False)
    model = Column(String(50), nullable=False)
    gl_string = Column(String(100), nullable=False, index=True)
    acquisition_date = Column(Date, nullable=True)
    recorded_condition = Column(String(20), nullable=True)  # Good/Bad/RMA/Lost
    cost_per_month = Column(Numeric(10, 2), nullable=True)

    # Soft delete support - critical fix
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(String(100), nullable=True)

    # Audit trail
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by = Column(String(100), nullable=True)

    # Unique constraint on serial + site combination
    __table_args__ = (
        Index("idx_assets_serial_site", "serial_number", "assigned_site_code", unique=True),
        Index("idx_assets_active", "is_deleted", "assigned_site_code"),
    )
