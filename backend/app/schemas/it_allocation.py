"""
Pydantic schemas for IT Allocation data.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class ITAllocationDeviceBase(BaseModel):
    hsn: Optional[str] = None
    mac_address: Optional[str] = None
    device_model: Optional[str] = None
    gl_string: str
    category: str
    amount: float = 0.0


class ITAllocationDeviceResponse(ITAllocationDeviceBase):
    device_id: int
    snapshot_id: str
    gl_company: Optional[str] = None
    gl_cost_center: Optional[str] = None
    gl_cost_unit: Optional[str] = None
    gl_account: Optional[str] = None
    gl_activity: Optional[str] = None
    gl_sub_account: Optional[str] = None

    class Config:
        from_attributes = True


class ITAllocationSnapshotBase(BaseModel):
    period: int
    year: int
    file_name: Optional[str] = None


class ITAllocationSnapshotResponse(ITAllocationSnapshotBase):
    snapshot_id: str
    upload_timestamp: datetime
    total_records: int
    rf_hardware_count: int
    rf_software_count: int
    uploaded_by: Optional[str] = None

    class Config:
        from_attributes = True


class ITAllocationSnapshotDetail(ITAllocationSnapshotResponse):
    devices: List[ITAllocationDeviceResponse] = []


class ITAllocationUploadResponse(BaseModel):
    status: str
    snapshot_id: str
    message: str
    total_records: int
    rf_hardware_count: int
    rf_software_count: int
    unique_devices: int
    unique_gl_strings: int
    parsing_errors: List[dict] = []


class SiteGLMappingBase(BaseModel):
    site_code: str
    gl_string: str
    category: Optional[str] = None
    is_primary: int = 1
    notes: Optional[str] = None


class SiteGLMappingCreate(SiteGLMappingBase):
    pass


class SiteGLMappingResponse(SiteGLMappingBase):
    mapping_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DeviceLookupResponse(BaseModel):
    """Response when looking up a device by serial number."""
    found: bool
    hsn: Optional[str] = None
    mac_address: Optional[str] = None
    device_model: Optional[str] = None
    gl_string: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    snapshot_period: Optional[str] = None  # e.g., "12/2025"


class GLStringSummary(BaseModel):
    """Summary of GL strings in the system."""
    gl_string: str
    category: str
    device_count: int
    total_amount: float
