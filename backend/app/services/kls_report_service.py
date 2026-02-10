"""
KLS Report service for generating reports in KLS Executive Summary format.
Calculates the 4 KPIs: On-Site Total, IT Allocation Variance, PBI Variance, Inactive Devices.
"""
import os
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any
from calendar import monthrange
from sqlalchemy.orm import Session
from sqlalchemy import func
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils.dataframe import dataframe_to_rows

from app.models.audit import AuditSubmission, AuditDetail
from app.models.asset import AssetMaster
from app.models.site import Site
from app.models.it_allocation import ITAllocationSnapshot, ITAllocationDevice
from app.models.pbi_snapshot import PBISnapshot, PBIDevice
from app.services.pbi_import_service import PBIImportService
from app.services.app_settings_service import AppSettingsService


class KLSReportService:
    """Service for generating KLS-format reports and dashboard data."""

    # DHL brand colors
    DHL_YELLOW = "FFCC00"
    DHL_RED = "D40511"

    def __init__(self, db: Session):
        self.db = db
        self.pbi_service = PBIImportService(db)
        self.settings_service = AppSettingsService(db)

    def get_kls_dashboard_summary(self, site_code: str) -> Dict[str, Any]:
        """
        Get dashboard data in KLS format for a specific site.

        Returns the 4 KPIs:
        1. On-Site Total (from latest audit)
        2. IT Allocation variance
        3. PBI/SOTI variance
        4. Inactive device count

        Plus asset inventory by type breakdown.
        """
        site = self.db.query(Site).filter(Site.site_code == site_code).first()
        if not site:
            raise ValueError(f"Site {site_code} not found")

        # Get latest completed audit
        latest_audit = (
            self.db.query(AuditSubmission)
            .filter(
                AuditSubmission.site_code == site_code,
                AuditSubmission.processing_status.in_(["completed", "completed_with_warnings"])
            )
            .order_by(AuditSubmission.audit_date.desc())
            .first()
        )

        # Get physical counts
        on_site_total = latest_audit.total_assets_found if latest_audit else 0
        condition_counts = self._get_condition_counts(latest_audit) if latest_audit else {}

        # Get IT Allocation data
        it_allocation_data = self._get_it_allocation_summary(site_code)

        # Get PBI data
        pbi_data = self.pbi_service.get_connection_summary(site_code)

        # Get inactive threshold
        inactive_threshold = self.settings_service.get_inactive_threshold()

        # Calculate variances
        it_allocation_variance = on_site_total - it_allocation_data["total"]
        pbi_variance = on_site_total - pbi_data.get("total", 0)

        # Get asset inventory by type
        inventory_by_type = self._get_inventory_by_type(site_code, latest_audit)

        # Get workflow status
        workflow = self._get_workflow_status(site_code, latest_audit)

        return {
            "site_code": site_code,
            "site_name": site.site_name,
            "audit_date": str(latest_audit.audit_date) if latest_audit else None,
            "auditor": latest_audit.auditor_name if latest_audit else None,
            "audit_period": self._get_audit_period(latest_audit),
            "report_generated": datetime.utcnow().isoformat(),

            # KPI 1: On-Site Total
            "on_site_total": on_site_total,
            "good_count": condition_counts.get("Good", 0),
            "bad_count": condition_counts.get("Bad", 0),
            "rma_count": condition_counts.get("RMA", 0),
            "lost_count": condition_counts.get("Lost", 0),

            # KPI 2: IT Allocation Variance
            "it_allocation_total": it_allocation_data["total"],
            "it_allocation_variance": it_allocation_variance,
            "it_allocation_variance_comment": self._generate_variance_comment(
                "IT Allocation", it_allocation_variance
            ),

            # KPI 3: PBI/SOTI Variance
            "pbi_total": pbi_data.get("total", 0),
            "pbi_variance": pbi_variance,
            "pbi_variance_comment": self._generate_variance_comment(
                "PBI/SOTI", pbi_variance
            ),
            "pbi_connected": pbi_data.get("connected", 0),
            "pbi_disconnected": pbi_data.get("disconnected", 0),

            # KPI 4: Inactive Devices
            "inactive_threshold_days": inactive_threshold,
            "inactive_device_count": pbi_data.get("disconnected", 0),

            # Asset inventory breakdown
            "inventory_by_type": inventory_by_type,

            # Workflow status
            "workflow": workflow,

            # Data freshness
            "it_allocation_snapshot": it_allocation_data.get("snapshot_date"),
            "pbi_snapshot": pbi_data.get("snapshot_date"),
        }

    def get_portfolio_kls_summary(self) -> Dict[str, Any]:
        """
        Get KLS-format summary across all active sites.
        """
        sites = self.db.query(Site).filter(Site.is_active == True).all()

        summaries = []
        totals = {
            "on_site_total": 0,
            "it_allocation_total": 0,
            "pbi_total": 0,
            "inactive_count": 0,
            "sites_count": 0,
        }

        for site in sites:
            try:
                summary = self.get_kls_dashboard_summary(site.site_code)
                summaries.append(summary)

                totals["on_site_total"] += summary.get("on_site_total", 0)
                totals["it_allocation_total"] += summary.get("it_allocation_total", 0)
                totals["pbi_total"] += summary.get("pbi_total", 0)
                totals["inactive_count"] += summary.get("inactive_device_count", 0)
                totals["sites_count"] += 1
            except Exception:
                continue

        return {
            "generated_at": datetime.utcnow().isoformat(),
            "totals": totals,
            "it_allocation_variance": totals["on_site_total"] - totals["it_allocation_total"],
            "pbi_variance": totals["on_site_total"] - totals["pbi_total"],
            "sites": summaries,
        }

    def get_inventory_by_type(self, site_code: str) -> List[Dict]:
        """
        Get asset inventory breakdown by device type.
        Matches the KLS Excel "ASSET INVENTORY BY TYPE" table format.
        """
        latest_audit = self._get_latest_audit(site_code)
        return self._get_inventory_by_type(site_code, latest_audit)

    def get_workflow_status(self, site_code: str) -> Dict[str, Any]:
        """
        Get monthly audit workflow status.
        """
        latest_audit = self._get_latest_audit(site_code)
        return self._get_workflow_status(site_code, latest_audit)

    def generate_excel_report(
        self,
        site_code: str,
        output_path: Optional[str] = None
    ) -> str:
        """
        Generate an Excel report in KLS format.

        Args:
            site_code: Site to generate report for
            output_path: Output file path (auto-generated if not provided)

        Returns:
            Path to generated Excel file
        """
        summary = self.get_kls_dashboard_summary(site_code)

        if not output_path:
            timestamp = datetime.now().strftime("%Y%m")
            output_path = f"/tmp/{timestamp} - {site_code} Asset Audit.xlsx"

        wb = Workbook()

        # Create Executive Summary sheet
        ws = wb.active
        ws.title = "Executive Summary"
        self._build_executive_summary_sheet(ws, summary)

        # Create Asset Detail sheet
        ws_detail = wb.create_sheet("Asset Detail")
        self._build_asset_detail_sheet(ws_detail, site_code)

        # Save
        wb.save(output_path)
        return output_path

    def _build_executive_summary_sheet(self, ws, summary: Dict):
        """Build the Executive Summary sheet matching KLS format."""
        # Styles
        header_font = Font(bold=True, size=14)
        kpi_font = Font(bold=True, size=11)
        yellow_fill = PatternFill(start_color=self.DHL_YELLOW, end_color=self.DHL_YELLOW, fill_type="solid")
        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )

        # Title
        now = datetime.now()
        ws['A1'] = f"ASSET AUDIT REPORT - {now.strftime('%B %Y')}"
        ws['A1'].font = Font(bold=True, size=16)

        # Site info
        ws['A3'] = "Site Code"
        ws['B3'] = summary.get("site_code", "")
        ws['C3'] = "Site Name"
        ws['D3'] = summary.get("site_name", "")

        ws['A4'] = "Audit Date"
        ws['B4'] = summary.get("audit_date", "")
        ws['C4'] = "Auditor"
        ws['D4'] = summary.get("auditor", "")

        ws['A5'] = "Audit Period"
        ws['B5'] = summary.get("audit_period", "")
        ws['C5'] = "Report Generated"
        ws['D5'] = datetime.now().strftime("%Y-%m-%d")

        # KPI Section header
        ws['A8'] = "KEY PERFORMANCE INDICATORS"
        ws['A8'].font = header_font
        ws['A8'].fill = yellow_fill

        # KPI labels
        ws['A9'] = "Site Data"
        ws['C9'] = "IT Allocation Data"
        ws['F9'] = "Operational Devices PBI Data"

        ws['A10'] = "On-Site Total"
        ws['C10'] = "IT Allocation Total"
        ws['D10'] = "Variance"
        ws['F10'] = "PBI Total"
        ws['G10'] = "Variance"
        ws['H10'] = f"{summary.get('inactive_threshold_days', 30)}-Day Inactive"

        # KPI values
        ws['A11'] = summary.get("on_site_total", 0)
        ws['C11'] = summary.get("it_allocation_total", 0)
        ws['D11'] = summary.get("it_allocation_variance", 0)
        ws['F11'] = summary.get("pbi_total", 0)
        ws['G11'] = summary.get("pbi_variance", 0)
        ws['H11'] = summary.get("inactive_device_count", 0)

        # Asset Inventory section
        ws['A14'] = "ASSET INVENTORY BY TYPE"
        ws['A14'].font = header_font
        ws['A14'].fill = yellow_fill

        # Inventory table headers
        headers = ["Device Type", "Prior Count", "Good", "Bad", "RMA", "Lost",
                   "PBI Total", "PBI Report Diff", "Current Count", "Δ Change"]
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=16, column=col, value=header)
            cell.font = kpi_font
            cell.fill = yellow_fill
            cell.border = thin_border

        # Inventory data
        inventory = summary.get("inventory_by_type", [])
        for row_idx, item in enumerate(inventory, 17):
            ws.cell(row=row_idx, column=1, value=item.get("device_type", "")).border = thin_border
            ws.cell(row=row_idx, column=2, value=item.get("prior_count", 0)).border = thin_border
            ws.cell(row=row_idx, column=3, value=item.get("good", 0)).border = thin_border
            ws.cell(row=row_idx, column=4, value=item.get("bad", 0)).border = thin_border
            ws.cell(row=row_idx, column=5, value=item.get("rma", 0)).border = thin_border
            ws.cell(row=row_idx, column=6, value=item.get("lost", 0)).border = thin_border
            ws.cell(row=row_idx, column=7, value=item.get("pbi_total", 0)).border = thin_border
            ws.cell(row=row_idx, column=8, value=item.get("pbi_report_diff", 0)).border = thin_border
            ws.cell(row=row_idx, column=9, value=item.get("current_count", 0)).border = thin_border
            ws.cell(row=row_idx, column=10, value=item.get("change", 0)).border = thin_border

        # Set column widths
        ws.column_dimensions['A'].width = 15
        ws.column_dimensions['B'].width = 15
        ws.column_dimensions['C'].width = 18
        ws.column_dimensions['D'].width = 12

    def _build_asset_detail_sheet(self, ws, site_code: str):
        """Build the Asset Detail sheet."""
        # Get asset details from latest audit
        latest_audit = self._get_latest_audit(site_code)
        if not latest_audit:
            ws['A1'] = "No audit data available"
            return

        details = self.db.query(AuditDetail).filter(
            AuditDetail.audit_id == latest_audit.audit_id
        ).all()

        # Headers
        headers = ["Serial Number", "Asset Number", "Model", "Site Code", "Condition",
                   "Status", "Shift", "Assigned User", "Last Scan Date", "GL", "Comment", "Audit Date"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header).font = Font(bold=True)

        # Data rows
        for row_idx, detail in enumerate(details, 2):
            ws.cell(row=row_idx, column=1, value=detail.serial_number)
            ws.cell(row=row_idx, column=2, value=detail.asset_number)
            ws.cell(row=row_idx, column=3, value=detail.model)
            ws.cell(row=row_idx, column=4, value=site_code)
            ws.cell(row=row_idx, column=5, value=detail.condition_code)
            ws.cell(row=row_idx, column=11, value=detail.comments)
            ws.cell(row=row_idx, column=12, value=str(latest_audit.audit_date) if latest_audit.audit_date else "")

    def _get_latest_audit(self, site_code: str) -> Optional[AuditSubmission]:
        """Get the latest completed audit for a site."""
        return (
            self.db.query(AuditSubmission)
            .filter(
                AuditSubmission.site_code == site_code,
                AuditSubmission.processing_status.in_(["completed", "completed_with_warnings"])
            )
            .order_by(AuditSubmission.audit_date.desc())
            .first()
        )

    def _get_condition_counts(self, audit: AuditSubmission) -> Dict[str, int]:
        """Get counts by condition code from audit details."""
        results = (
            self.db.query(
                AuditDetail.condition_code,
                func.count(AuditDetail.detail_id).label("count")
            )
            .filter(AuditDetail.audit_id == audit.audit_id)
            .group_by(AuditDetail.condition_code)
            .all()
        )
        return {r.condition_code or "Unknown": r.count for r in results}

    def _get_it_allocation_summary(self, site_code: str) -> Dict[str, Any]:
        """Get IT Allocation summary for a site."""
        # Get latest snapshot
        latest = (
            self.db.query(ITAllocationSnapshot)
            .order_by(ITAllocationSnapshot.year.desc(), ITAllocationSnapshot.period.desc())
            .first()
        )

        if not latest:
            return {"total": 0, "snapshot_date": None}

        # Get site GL mappings
        from app.models.it_allocation import SiteGLMapping
        mappings = self.db.query(SiteGLMapping).filter(
            SiteGLMapping.site_code == site_code
        ).all()

        gl_strings = [m.gl_string for m in mappings]

        if not gl_strings:
            # If no mappings, return 0
            return {
                "total": 0,
                "snapshot_date": latest.upload_timestamp.isoformat() if latest.upload_timestamp else None,
                "period": f"{latest.period}/{latest.year}"
            }

        # Count devices matching site's GL strings
        count = (
            self.db.query(func.count(ITAllocationDevice.device_id))
            .filter(
                ITAllocationDevice.snapshot_id == latest.snapshot_id,
                ITAllocationDevice.gl_string.in_(gl_strings)
            )
            .scalar()
        ) or 0

        return {
            "total": count,
            "snapshot_date": latest.upload_timestamp.isoformat() if latest.upload_timestamp else None,
            "period": f"{latest.period}/{latest.year}"
        }

    def _get_inventory_by_type(
        self,
        site_code: str,
        latest_audit: Optional[AuditSubmission]
    ) -> List[Dict]:
        """
        Get asset inventory breakdown by device type.
        """
        if not latest_audit:
            return []

        # Get current audit counts by model and condition
        current_counts = (
            self.db.query(
                AuditDetail.model,
                AuditDetail.condition_code,
                func.count(AuditDetail.detail_id).label("count")
            )
            .filter(AuditDetail.audit_id == latest_audit.audit_id)
            .group_by(AuditDetail.model, AuditDetail.condition_code)
            .all()
        )

        # Aggregate by model
        model_data = {}
        for r in current_counts:
            model = r.model or "Unknown"
            if model not in model_data:
                model_data[model] = {"Good": 0, "Bad": 0, "RMA": 0, "Lost": 0}
            condition = r.condition_code or "Good"
            if condition in model_data[model]:
                model_data[model][condition] = r.count
            else:
                model_data[model]["Good"] += r.count

        # Get PBI counts by model
        pbi_snapshot = self.pbi_service.get_latest_snapshot(site_code)
        pbi_counts = {}
        if pbi_snapshot:
            pbi_results = (
                self.db.query(
                    PBIDevice.model,
                    func.count(PBIDevice.device_id).label("count")
                )
                .filter(PBIDevice.snapshot_id == pbi_snapshot.snapshot_id)
                .group_by(PBIDevice.model)
                .all()
            )
            pbi_counts = {r.model or "Unknown": r.count for r in pbi_results}

        # Get prior counts (from previous audit if available)
        prior_audit = (
            self.db.query(AuditSubmission)
            .filter(
                AuditSubmission.site_code == site_code,
                AuditSubmission.audit_id != latest_audit.audit_id,
                AuditSubmission.processing_status.in_(["completed", "completed_with_warnings"])
            )
            .order_by(AuditSubmission.audit_date.desc())
            .first()
        )

        prior_counts = {}
        if prior_audit:
            prior_results = (
                self.db.query(
                    AuditDetail.model,
                    func.count(AuditDetail.detail_id).label("count")
                )
                .filter(AuditDetail.audit_id == prior_audit.audit_id)
                .group_by(AuditDetail.model)
                .all()
            )
            prior_counts = {r.model or "Unknown": r.count for r in prior_results}

        # Build inventory table
        inventory = []
        for model, conditions in model_data.items():
            current = sum(conditions.values())
            prior = prior_counts.get(model, 0)
            pbi_total = pbi_counts.get(model, 0)

            inventory.append({
                "device_type": model,
                "prior_count": prior,
                "good": conditions.get("Good", 0),
                "bad": conditions.get("Bad", 0),
                "rma": conditions.get("RMA", 0),
                "lost": conditions.get("Lost", 0),
                "pbi_total": pbi_total,
                "pbi_report_diff": current - pbi_total,
                "current_count": current,
                "change": current - prior,
            })

        return sorted(inventory, key=lambda x: x["current_count"], reverse=True)

    def _get_workflow_status(
        self,
        site_code: str,
        latest_audit: Optional[AuditSubmission]
    ) -> Dict[str, Any]:
        """
        Get monthly audit workflow status.
        """
        now = datetime.now()

        # Calculate next report due date (first Friday of next month)
        if now.day > 7:
            # Already past first Friday, next due is next month
            if now.month == 12:
                next_month = now.replace(year=now.year + 1, month=1, day=1)
            else:
                next_month = now.replace(month=now.month + 1, day=1)
        else:
            next_month = now.replace(day=1)

        # Find first Friday
        first_day = next_month
        days_until_friday = (4 - first_day.weekday()) % 7
        report_deadline = first_day + timedelta(days=days_until_friday)

        # Internal review is Thursday before
        internal_review_due = report_deadline - timedelta(days=1)

        # Check if audit completed this period
        current_period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        audit_completed = False
        if latest_audit and latest_audit.audit_date:
            audit_completed = latest_audit.audit_date >= current_period_start.date()

        return {
            "audit_due_date": report_deadline.strftime("%Y-%m-%d"),
            "internal_review_due": internal_review_due.strftime("%Y-%m-%d"),
            "report_deadline": report_deadline.strftime("%Y-%m-%d"),
            "audit_completed": audit_completed,
            "review_completed": False,  # Would need tracking
            "report_sent": False,  # Would need tracking
            "days_until_due": (report_deadline.date() - now.date()).days,
        }

    def _get_audit_period(self, audit: Optional[AuditSubmission]) -> str:
        """Get formatted audit period string."""
        if not audit or not audit.audit_date:
            return ""

        audit_date = audit.audit_date
        quarter = (audit_date.month - 1) // 3 + 1
        return f"Q{quarter} {audit_date.year}"

    def _generate_variance_comment(self, source: str, variance: int) -> str:
        """Generate a default comment for a variance."""
        if variance == 0:
            return f"{source} matches physical count"
        elif variance > 0:
            return f"{variance} more on site than in {source}"
        else:
            return f"{abs(variance)} fewer on site than in {source}"
