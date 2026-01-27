"""
Variance and action item schemas.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List
from uuid import UUID
from pydantic import BaseModel

from app.models.variance import VarianceType, PriorityLevel, ActionStatus


class VarianceResponse(BaseModel):
    variance_id: UUID
    audit_id: UUID
    serial_number: Optional[str]
    variance_type: VarianceType
    priority: PriorityLevel
    current_gl_site: Optional[str]
    physical_site: Optional[str]
    master_condition: Optional[str]
    physical_condition: Optional[str]
    asset_type: Optional[str]
    model: Optional[str]
    monthly_cost_impact: Optional[Decimal]
    action_required: Optional[str]
    recommended_action: Optional[str]
    email_template: Optional[str]
    status: ActionStatus
    assigned_to: Optional[str]
    resolution_notes: Optional[str]
    resolved_at: Optional[datetime]
    resolved_by: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class VarianceSummary(BaseModel):
    audit_id: UUID
    site_code: str
    audit_date: str
    summary: Dict
    # summary contains:
    # - total_variances
    # - by_type: dict mapping VarianceType to count
    # - by_priority: dict mapping PriorityLevel to count
    # - financial_impact: dict with potential_monthly_savings, etc.
    # - gl_accuracy: dict with assets_in_gl, correct, accuracy_percentage


class VarianceStatusUpdate(BaseModel):
    status: ActionStatus
    resolution_notes: Optional[str] = None
    assigned_to: Optional[str] = None


class ActionItemResponse(BaseModel):
    """Grouped action items by category."""
    removal: Dict  # Assets to remove from GL
    transfer: Dict  # Assets to transfer
    addition: Dict  # Assets to add
    condition: Dict  # Condition updates
    mdm: Dict  # MDM compliance items


class VarianceByType(BaseModel):
    variance_type: VarianceType
    title: str
    description: str
    count: int
    total_monthly_impact: Optional[Decimal]
    items: List[VarianceResponse]
