"""
Report generation service for executive summaries and action lists.
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.audit import AuditSubmission, AuditDetail
from app.models.asset import AssetMaster
from app.models.variance import Variance, VarianceType, PriorityLevel, ActionStatus
from app.models.site import Site


class ReportService:
    """Service for generating reports."""

    def __init__(self, db: Session):
        self.db = db

    def generate_executive_summary(self, audit_id: UUID) -> Dict:
        """Generate executive summary report data."""
        audit = self.db.query(AuditSubmission).filter(
            AuditSubmission.audit_id == audit_id
        ).first()

        if not audit:
            raise ValueError(f"Audit {audit_id} not found")

        site = self.db.query(Site).filter(
            Site.site_code == audit.site_code
        ).first()

        variances = self.db.query(Variance).filter(
            Variance.audit_id == audit_id
        ).all()

        # Physical audit results
        conditions = self._count_by_condition(audit_id)

        # GL reconciliation counts
        variance_counts = self._count_by_variance_type(variances)

        # Assets in GL for this site
        assets_in_gl = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == audit.site_code,
            AssetMaster.is_deleted == False
        ).count()

        # Calculate metrics
        correct_count = variance_counts.get(VarianceType.CORRECT, 0)
        gl_accuracy = (correct_count / assets_in_gl * 100) if assets_in_gl > 0 else 0

        potential_savings = sum(
            float(v.monthly_cost_impact or 0)
            for v in variances
            if v.variance_type == VarianceType.MISSING
        )

        # Action item counts
        priority_counts = self._count_by_priority(variances)

        # Previous audit for trend
        trend = self._calculate_trend(audit.site_code, audit.audit_date, gl_accuracy)

        return {
            "header": {
                "title": "DHL SUPPLY CHAIN - ASSET AUDIT RECONCILIATION",
                "site_code": audit.site_code,
                "site_name": site.site_name if site else audit.site_code,
                "account_name": site.account_name if site else "Unknown",
                "audit_date": str(audit.audit_date),
                "auditor": audit.auditor_name,
                "generated_at": datetime.utcnow().isoformat(),
            },
            "physical_results": {
                "total_found": audit.total_assets_found,
                "good": conditions.get("Good", 0),
                "bad": conditions.get("Bad", 0),
                "rma": conditions.get("RMA", 0),
                "lost": conditions.get("Lost", 0),
            },
            "gl_reconciliation": {
                "assets_in_gl": assets_in_gl,
                "correct": variance_counts.get(VarianceType.CORRECT, 0),
                "missing": variance_counts.get(VarianceType.MISSING, 0),
                "misallocated": variance_counts.get(VarianceType.MISALLOCATED, 0),
                "untracked": variance_counts.get(VarianceType.UNTRACKED, 0),
                "condition_mismatch": variance_counts.get(VarianceType.CONDITION_MISMATCH, 0),
            },
            "metrics": {
                "gl_accuracy_pct": round(gl_accuracy, 1),
                "potential_monthly_savings": round(potential_savings, 2),
                "potential_annual_savings": round(potential_savings * 12, 2),
            },
            "action_items": {
                "high_priority": priority_counts.get(PriorityLevel.HIGH, 0),
                "medium_priority": priority_counts.get(PriorityLevel.MEDIUM, 0),
                "low_priority": priority_counts.get(PriorityLevel.LOW, 0),
            },
            "trend": trend,
        }

    def generate_action_list(self, audit_id: UUID) -> Dict:
        """Generate detailed action item lists grouped by type."""
        variances = self.db.query(Variance).filter(
            Variance.audit_id == audit_id
        ).order_by(Variance.priority, Variance.serial_number).all()

        def serialize_variance(v: Variance) -> Dict:
            return {
                "variance_id": str(v.variance_id),
                "serial_number": v.serial_number,
                "asset_type": v.asset_type,
                "model": v.model,
                "priority": v.priority.value if v.priority else None,
                "current_gl_site": v.current_gl_site,
                "physical_site": v.physical_site,
                "master_condition": v.master_condition,
                "physical_condition": v.physical_condition,
                "monthly_cost_impact": float(v.monthly_cost_impact) if v.monthly_cost_impact else None,
                "action_required": v.action_required,
                "email_template": v.email_template,
                "status": v.status.value if v.status else None,
            }

        # Group by type
        removal_items = [v for v in variances if v.variance_type == VarianceType.MISSING]
        transfer_items = [v for v in variances if v.variance_type == VarianceType.MISALLOCATED]
        addition_items = [v for v in variances if v.variance_type == VarianceType.UNTRACKED]
        condition_items = [v for v in variances if v.variance_type == VarianceType.CONDITION_MISMATCH]
        mdm_items = [v for v in variances if v.variance_type in (
            VarianceType.MDM_NOT_ENROLLED, VarianceType.MDM_INACTIVE_WARNING
        )]

        return {
            "removal": {
                "title": "Assets to REMOVE from Your GL",
                "description": f"{len(removal_items)} assets charged to your GL but NOT found during physical audit",
                "total_monthly_savings": sum(float(v.monthly_cost_impact or 0) for v in removal_items),
                "count": len(removal_items),
                "items": [serialize_variance(v) for v in removal_items],
            },
            "transfer": {
                "title": "Assets to TRANSFER (Wrong GL)",
                "description": f"{len(transfer_items)} assets found on your site but currently charged to other sites",
                "count": len(transfer_items),
                "items": [serialize_variance(v) for v in transfer_items],
            },
            "addition": {
                "title": "Assets to ADD (Found but Not in System)",
                "description": f"{len(addition_items)} assets found on your site but NOT in master database",
                "count": len(addition_items),
                "items": [serialize_variance(v) for v in addition_items],
            },
            "condition": {
                "title": "Condition Code Updates",
                "description": f"{len(condition_items)} assets with condition discrepancies",
                "count": len(condition_items),
                "items": [serialize_variance(v) for v in condition_items],
            },
            "mdm": {
                "title": "MDM Compliance Warnings",
                "description": f"{len(mdm_items)} MDM-related items requiring attention",
                "count": len(mdm_items),
                "items": [serialize_variance(v) for v in mdm_items],
            },
        }

    def get_portfolio_summary(
        self,
        account_name: Optional[str] = None,
        region: Optional[str] = None
    ) -> Dict:
        """Get portfolio-wide summary across sites."""
        # Build site query
        query = self.db.query(Site).filter(Site.is_active == True)
        if account_name:
            query = query.filter(Site.account_name == account_name)
        if region:
            query = query.filter(Site.region == region)

        sites = query.all()

        site_details = []
        total_assets_in_gl = 0
        total_potential_savings = Decimal("0")
        total_high_priority = 0
        sites_overdue = 0

        for site in sites:
            # Get latest audit for site
            latest_audit = self.db.query(AuditSubmission).filter(
                AuditSubmission.site_code == site.site_code,
                AuditSubmission.processing_status.in_([
                    "completed", "completed_with_warnings"
                ])
            ).order_by(AuditSubmission.audit_date.desc()).first()

            # Count assets in GL
            assets_in_gl = self.db.query(AssetMaster).filter(
                AssetMaster.assigned_site_code == site.site_code,
                AssetMaster.is_deleted == False
            ).count()
            total_assets_in_gl += assets_in_gl

            # Calculate days since audit
            days_since_audit = None
            is_overdue = False
            if latest_audit:
                days_since_audit = (date.today() - latest_audit.audit_date).days
                is_overdue = days_since_audit > 35
            else:
                is_overdue = True

            if is_overdue:
                sites_overdue += 1

            # Get metrics from latest audit
            gl_accuracy = None
            potential_savings = Decimal("0")
            high_priority = 0

            if latest_audit:
                variances = self.db.query(Variance).filter(
                    Variance.audit_id == latest_audit.audit_id
                ).all()

                correct = sum(1 for v in variances if v.variance_type == VarianceType.CORRECT)
                gl_accuracy = (correct / assets_in_gl * 100) if assets_in_gl > 0 else None

                potential_savings = sum(
                    v.monthly_cost_impact or Decimal("0")
                    for v in variances
                    if v.variance_type == VarianceType.MISSING
                )
                total_potential_savings += potential_savings

                high_priority = sum(
                    1 for v in variances
                    if v.priority == PriorityLevel.HIGH and v.status == ActionStatus.PENDING
                )
                total_high_priority += high_priority

            site_details.append({
                "site_code": site.site_code,
                "site_name": site.site_name,
                "account_name": site.account_name,
                "region": site.region,
                "audit_date": str(latest_audit.audit_date) if latest_audit else None,
                "days_since_audit": days_since_audit,
                "total_assets_found": latest_audit.total_assets_found if latest_audit else None,
                "assets_in_gl": assets_in_gl,
                "gl_accuracy_pct": round(gl_accuracy, 1) if gl_accuracy is not None else None,
                "potential_monthly_savings": float(potential_savings),
                "high_priority_items": high_priority,
                "is_overdue": is_overdue,
            })

        # Sort by GL accuracy (lowest first) to highlight problem sites
        site_details.sort(key=lambda x: (x["gl_accuracy_pct"] or 0, x["site_code"]))

        # Calculate weighted average GL accuracy
        total_accuracy = None
        if site_details:
            sites_with_accuracy = [s for s in site_details if s["gl_accuracy_pct"] is not None]
            if sites_with_accuracy:
                total_weight = sum(s["assets_in_gl"] for s in sites_with_accuracy)
                if total_weight > 0:
                    total_accuracy = sum(
                        s["gl_accuracy_pct"] * s["assets_in_gl"]
                        for s in sites_with_accuracy
                    ) / total_weight

        return {
            "total_sites": len(sites),
            "total_assets_in_gl": total_assets_in_gl,
            "total_gl_accuracy_pct": round(total_accuracy, 1) if total_accuracy else None,
            "total_potential_savings": float(total_potential_savings),
            "sites_with_overdue_audits": sites_overdue,
            "high_priority_items": total_high_priority,
            "site_details": site_details,
        }

    def get_site_metrics(self, site_code: str) -> Dict:
        """Get detailed metrics for a specific site."""
        site = self.db.query(Site).filter(Site.site_code == site_code).first()
        if not site:
            raise ValueError(f"Site {site_code} not found")

        latest_audit = self.db.query(AuditSubmission).filter(
            AuditSubmission.site_code == site_code,
            AuditSubmission.processing_status.in_(["completed", "completed_with_warnings"])
        ).order_by(AuditSubmission.audit_date.desc()).first()

        assets_in_gl = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == site_code,
            AssetMaster.is_deleted == False
        ).count()

        metrics = {
            "site_code": site.site_code,
            "site_name": site.site_name,
            "account_name": site.account_name,
            "region": site.region,
            "latest_audit_date": None,
            "latest_audit_id": None,
            "total_assets_found": None,
            "assets_in_gl": assets_in_gl,
            "correct_count": 0,
            "missing_count": 0,
            "misallocated_count": 0,
            "untracked_count": 0,
            "condition_mismatch_count": 0,
            "gl_accuracy_pct": None,
            "potential_monthly_savings": 0,
            "pending_high_priority": 0,
            "pending_medium_priority": 0,
            "pending_low_priority": 0,
            "completed_this_month": 0,
            "gl_accuracy_trend": None,
        }

        if latest_audit:
            metrics["latest_audit_date"] = str(latest_audit.audit_date)
            metrics["latest_audit_id"] = str(latest_audit.audit_id)
            metrics["total_assets_found"] = latest_audit.total_assets_found

            variances = self.db.query(Variance).filter(
                Variance.audit_id == latest_audit.audit_id
            ).all()

            # Count by type
            for v in variances:
                if v.variance_type == VarianceType.CORRECT:
                    metrics["correct_count"] += 1
                elif v.variance_type == VarianceType.MISSING:
                    metrics["missing_count"] += 1
                    metrics["potential_monthly_savings"] += float(v.monthly_cost_impact or 0)
                elif v.variance_type == VarianceType.MISALLOCATED:
                    metrics["misallocated_count"] += 1
                elif v.variance_type == VarianceType.UNTRACKED:
                    metrics["untracked_count"] += 1
                elif v.variance_type == VarianceType.CONDITION_MISMATCH:
                    metrics["condition_mismatch_count"] += 1

                # Count pending by priority
                if v.status == ActionStatus.PENDING:
                    if v.priority == PriorityLevel.HIGH:
                        metrics["pending_high_priority"] += 1
                    elif v.priority == PriorityLevel.MEDIUM:
                        metrics["pending_medium_priority"] += 1
                    elif v.priority == PriorityLevel.LOW:
                        metrics["pending_low_priority"] += 1

            # GL accuracy
            if assets_in_gl > 0:
                metrics["gl_accuracy_pct"] = round(
                    metrics["correct_count"] / assets_in_gl * 100, 1
                )

            # Trend vs previous
            metrics["gl_accuracy_trend"] = self._calculate_trend(
                site_code, latest_audit.audit_date, metrics["gl_accuracy_pct"]
            )

        return metrics

    def _count_by_condition(self, audit_id: UUID) -> Dict[str, int]:
        """Count assets by condition."""
        details = self.db.query(AuditDetail).filter(
            AuditDetail.audit_id == audit_id,
            AuditDetail.is_duplicate == False
        ).all()

        counts: Dict[str, int] = {}
        for d in details:
            counts[d.physical_condition] = counts.get(d.physical_condition, 0) + 1
        return counts

    def _count_by_variance_type(self, variances: List[Variance]) -> Dict[VarianceType, int]:
        """Count variances by type."""
        counts: Dict[VarianceType, int] = {}
        for v in variances:
            counts[v.variance_type] = counts.get(v.variance_type, 0) + 1
        return counts

    def _count_by_priority(self, variances: List[Variance]) -> Dict[PriorityLevel, int]:
        """Count variances by priority."""
        counts: Dict[PriorityLevel, int] = {}
        for v in variances:
            counts[v.priority] = counts.get(v.priority, 0) + 1
        return counts

    def _calculate_trend(
        self,
        site_code: str,
        current_audit_date: date,
        current_accuracy: Optional[float]
    ) -> Optional[float]:
        """Calculate GL accuracy trend vs previous month."""
        if current_accuracy is None:
            return None

        # Get previous audit
        previous = self.db.query(AuditSubmission).filter(
            AuditSubmission.site_code == site_code,
            AuditSubmission.audit_date < current_audit_date,
            AuditSubmission.processing_status.in_(["completed", "completed_with_warnings"])
        ).order_by(AuditSubmission.audit_date.desc()).first()

        if not previous:
            return None

        # Calculate previous accuracy
        prev_variances = self.db.query(Variance).filter(
            Variance.audit_id == previous.audit_id
        ).all()

        prev_correct = sum(1 for v in prev_variances if v.variance_type == VarianceType.CORRECT)

        prev_assets_in_gl = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == site_code,
            AssetMaster.is_deleted == False
        ).count()

        if prev_assets_in_gl == 0:
            return None

        prev_accuracy = prev_correct / prev_assets_in_gl * 100
        return round(current_accuracy - prev_accuracy, 1)
