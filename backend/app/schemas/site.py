"""
Site schemas for distribution center management.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class SiteCreate(BaseModel):
    site_code: str
    site_name: str
    account_name: str
    region: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "US"
    primary_contact: Optional[str] = None
    contact_email: Optional[str] = None


class SiteUpdate(BaseModel):
    site_name: Optional[str] = None
    account_name: Optional[str] = None
    region: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    primary_contact: Optional[str] = None
    contact_email: Optional[str] = None
    is_active: Optional[bool] = None


class SiteGLMappingInfo(BaseModel):
    mapping_id: int
    gl_string: str
    category: Optional[str]
    is_primary: int

    class Config:
        from_attributes = True


class SiteResponse(BaseModel):
    site_code: str
    site_name: str
    account_name: str
    region: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    country: Optional[str]
    primary_contact: Optional[str]
    contact_email: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class SiteDetailResponse(SiteResponse):
    """Site response with GL mappings included."""
    gl_mappings: List[SiteGLMappingInfo] = []

    class Config:
        from_attributes = True
