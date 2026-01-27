"""
Asset schemas for master data management.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, field_validator


VALID_CONDITIONS = ["Good", "Bad", "RMA", "Lost"]


class AssetCreate(BaseModel):
    serial_number: str
    asset_type: str
    model: str
    assigned_site_code: str
    gl_string: str
    acquisition_date: Optional[date] = None
    recorded_condition: Optional[str] = None
    cost_per_month: Optional[Decimal] = None

    @field_validator("recorded_condition")
    @classmethod
    def validate_condition(cls, v):
        if v and v not in VALID_CONDITIONS:
            raise ValueError(f"Condition must be one of: {', '.join(VALID_CONDITIONS)}")
        return v


class AssetUpdate(BaseModel):
    asset_type: Optional[str] = None
    model: Optional[str] = None
    assigned_site_code: Optional[str] = None
    gl_string: Optional[str] = None
    acquisition_date: Optional[date] = None
    recorded_condition: Optional[str] = None
    cost_per_month: Optional[Decimal] = None

    @field_validator("recorded_condition")
    @classmethod
    def validate_condition(cls, v):
        if v and v not in VALID_CONDITIONS:
            raise ValueError(f"Condition must be one of: {', '.join(VALID_CONDITIONS)}")
        return v


class AssetResponse(BaseModel):
    asset_id: UUID
    serial_number: str
    asset_type: str
    model: str
    assigned_site_code: str
    gl_string: str
    acquisition_date: Optional[date]
    recorded_condition: Optional[str]
    cost_per_month: Optional[Decimal]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssetBulkUpload(BaseModel):
    """Response for bulk upload operation."""
    total_records: int
    created: int
    updated: int
    errors: List[dict]
    warnings: List[dict]
