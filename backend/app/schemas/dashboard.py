"""
Dashboard schemas for portfolio and site metrics.
"""
from datetime import date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel


class SiteMetricDetail(BaseModel):
    site_code: str
    site_name: str
    account_name: str
    region: Optional[str]
    audit_date: Optional[date]
    days_since_audit: Optional[int]
    total_assets_found: Optional[int]
    assets_in_gl: int
    gl_accuracy_pct: Optional[float]
    potential_monthly_savings: Optional[Decimal]
    high_priority_items: int
    is_overdue: bool  # No audit in 35+ days


class PortfolioSummary(BaseModel):
    total_sites: int
    total_assets_in_gl: int
    total_gl_accuracy_pct: Optional[float]
    total_potential_savings: Decimal
    sites_with_overdue_audits: int
    high_priority_items: int
    site_details: List[SiteMetricDetail]


class SiteMetrics(BaseModel):
    site_code: str
    site_name: str
    account_name: str
    region: Optional[str]

    # Current audit metrics
    latest_audit_date: Optional[date]
    latest_audit_id: Optional[str]
    total_assets_found: Optional[int]
    assets_in_gl: int

    # Variance breakdown
    correct_count: int
    missing_count: int
    misallocated_count: int
    untracked_count: int
    condition_mismatch_count: int

    # Financial
    gl_accuracy_pct: Optional[float]
    potential_monthly_savings: Optional[Decimal]

    # Action items
    pending_high_priority: int
    pending_medium_priority: int
    pending_low_priority: int
    completed_this_month: int

    # Trend (vs previous month)
    gl_accuracy_trend: Optional[float]  # Positive = improving


class TrendData(BaseModel):
    month: str
    gl_accuracy_pct: float
    potential_savings: Decimal
    total_assets: int


class DashboardTrends(BaseModel):
    site_code: Optional[str]  # None for portfolio-wide
    trends: List[TrendData]
