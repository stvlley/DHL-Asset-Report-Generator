"""
Audit schemas for physical audit submissions.
"""
from datetime import date, datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.models.audit import ProcessingStatus


class AuditUpload(BaseModel):
    site_code: str
    audit_date: date
    auditor_name: str


class AuditDetailResponse(BaseModel):
    detail_id: int
    row_number: Optional[int]
    serial_number: str
    asset_type: str
    model: str
    physical_condition: str
    location_notes: Optional[str]
    is_duplicate: bool
    duplicate_of_row: Optional[int]

    class Config:
        from_attributes = True


class AuditResponse(BaseModel):
    audit_id: UUID
    site_code: str
    audit_date: date
    auditor_name: str
    upload_timestamp: datetime
    file_name: Optional[str]
    total_assets_found: int
    processing_status: ProcessingStatus
    error_message: Optional[str]
    warning_count: int

    class Config:
        from_attributes = True


class AuditSummary(BaseModel):
    audit_id: UUID
    site_code: str
    site_name: str
    audit_date: date
    auditor_name: str
    total_assets_found: int
    processing_status: ProcessingStatus
    gl_accuracy_pct: Optional[float]
    potential_monthly_savings: Optional[float]
    high_priority_count: int
    medium_priority_count: int
    low_priority_count: int


class ValidationError(BaseModel):
    row: int
    field: str
    message: str


class AuditUploadResponse(BaseModel):
    status: str
    audit_id: Optional[UUID]
    message: str
    total_assets: int
    processing_status: ProcessingStatus
    validation_errors: List[ValidationError] = []
    warnings: List[ValidationError] = []
