"""
Site schemas for distribution center management.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SiteCreate(BaseModel):
    site_code: str
    site_name: str
    account_name: str
    region: Optional[str] = None
    address: Optional[str] = None
    primary_contact: Optional[str] = None


class SiteUpdate(BaseModel):
    site_name: Optional[str] = None
    account_name: Optional[str] = None
    region: Optional[str] = None
    address: Optional[str] = None
    primary_contact: Optional[str] = None
    is_active: Optional[bool] = None


class SiteResponse(BaseModel):
    site_code: str
    site_name: str
    account_name: str
    region: Optional[str]
    address: Optional[str]
    primary_contact: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
