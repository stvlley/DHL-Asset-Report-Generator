"""
Reconciliation engine for comparing physical audits against master data.

This is the core business logic of the application.

Critical Design Decisions:
1. Physical audit is source of truth
2. Handles duplicate serials in audit (flags them, doesn't reject)
3. Handles assets found at multiple sites
4. Generates prioritized action items with email templates
"""
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import List, Dict, Optional, Tuple
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.asset import AssetMaster
from app.models.audit import AuditSubmission, AuditDetail, ProcessingStatus
from app.models.variance import Variance, VarianceType, PriorityLevel, ActionStatus
from app.models.mdm import MDMSnapshot, MDMDetail
from app.models.site import Site


class ReconciliationService:
    """Service for reconciling physical audits against master data."""

    def __init__(self, db: Session):
        self.db = db

    def reconcile_audit(self, audit_id: UUID) -> List[Variance]:
        """
        Main reconciliation function that processes a physical audit
        and generates all variances and action items.
        """
        # 1. Load audit and related data
        audit = self.db.query(AuditSubmission).filter(
            AuditSubmission.audit_id == audit_id
        ).first()

        if not audit:
            raise ValueError(f"Audit {audit_id} not found")

        # Update status to processing
        audit.processing_status = ProcessingStatus.PROCESSING
        self.db.commit()

        try:
            # Load physical audit details
            physical_assets = self.db.query(AuditDetail).filter(
                AuditDetail.audit_id == audit_id
            ).all()

            # Load master assets for this site
            master_assets = self.db.query(AssetMaster).filter(
                AssetMaster.assigned_site_code == audit.site_code,
                AssetMaster.is_deleted == False
            ).all()

            # Load site info
            site = self.db.query(Site).filter(
                Site.site_code == audit.site_code
            ).first()

            # Check for MDM data
            mdm_snapshot = self.db.query(MDMSnapshot).filter(
                MDMSnapshot.audit_id == audit_id
            ).first()

            # 2. Build lookup dictionaries
            physical_by_serial: Dict[str, List[AuditDetail]] = {}
            for asset in physical_assets:
                if asset.serial_number not in physical_by_serial:
                    physical_by_serial[asset.serial_number] = []
                physical_by_serial[asset.serial_number].append(asset)

            master_by_serial: Dict[str, AssetMaster] = {
                asset.serial_number: asset for asset in master_assets
            }

            # Check for assets assigned to this site in master but also found elsewhere
            all_master_with_serial = {}
            for serial in physical_by_serial.keys():
                all_records = self.db.query(AssetMaster).filter(
                    AssetMaster.serial_number == serial,
                    AssetMaster.is_deleted == False
                ).all()
                if all_records:
                    all_master_with_serial[serial] = all_records

            # 3. Generate variances
            variances = []

            # Process duplicate serials in physical audit (Critical Fix)
            variances.extend(self._process_duplicates_in_audit(
                audit_id, physical_by_serial, audit.site_code
            ))

            # Process each unique physically found asset
            physical_serials = set(physical_by_serial.keys())
            master_serials = set(master_by_serial.keys())

            for serial in physical_serials:
                physical_asset = physical_by_serial[serial][0]  # Use first occurrence

                if serial in master_serials:
                    master_asset = master_by_serial[serial]
                    variances.extend(self._process_matched_asset(
                        audit_id, physical_asset, master_asset, audit, site
                    ))
                elif serial in all_master_with_serial:
                    # Found in master but assigned to different site
                    other_master = all_master_with_serial[serial][0]
                    variances.append(self._create_misallocated_variance(
                        audit_id, physical_asset, other_master, audit, site
                    ))
                else:
                    # Not found in master at all
                    variances.append(self._create_untracked_variance(
                        audit_id, physical_asset, audit, site
                    ))

            # Process missing assets (in GL but not found physically)
            missing_serials = master_serials - physical_serials
            for serial in missing_serials:
                master_asset = master_by_serial[serial]
                mdm_info = self._get_mdm_info(mdm_snapshot, serial) if mdm_snapshot else None
                variances.append(self._create_missing_variance(
                    audit_id, master_asset, audit, site, mdm_info
                ))

            # Process MDM compliance checks if data available
            if mdm_snapshot:
                variances.extend(self._process_mdm_compliance(
                    audit_id, physical_by_serial, mdm_snapshot
                ))

            # 4. Save variances
            for variance in variances:
                self.db.add(variance)

            # 5. Update audit status
            warning_count = sum(1 for v in variances if v.variance_type == VarianceType.DUPLICATE_IN_AUDIT)
            audit.warning_count = warning_count
            audit.processing_status = (
                ProcessingStatus.COMPLETED_WITH_WARNINGS if warning_count > 0
                else ProcessingStatus.COMPLETED
            )
            self.db.commit()

            return variances

        except Exception as e:
            audit.processing_status = ProcessingStatus.ERROR
            audit.error_message = str(e)
            self.db.commit()
            raise

    def _process_duplicates_in_audit(
        self,
        audit_id: UUID,
        physical_by_serial: Dict[str, List[AuditDetail]],
        site_code: str
    ) -> List[Variance]:
        """Flag duplicate serial numbers found in physical audit."""
        variances = []

        for serial, assets in physical_by_serial.items():
            if len(assets) > 1:
                # Mark duplicates in audit_details
                first_row = assets[0].row_number
                for asset in assets[1:]:
                    asset.is_duplicate = True
                    asset.duplicate_of_row = first_row

                # Create warning variance
                variances.append(Variance(
                    audit_id=audit_id,
                    serial_number=serial,
                    variance_type=VarianceType.DUPLICATE_IN_AUDIT,
                    priority=PriorityLevel.MEDIUM,
                    physical_site=site_code,
                    action_required=f"Duplicate serial found in audit: {serial} appears {len(assets)} times",
                    recommended_action="Verify physical count - same serial scanned multiple times or data entry error",
                ))

        return variances

    def _process_matched_asset(
        self,
        audit_id: UUID,
        physical: AuditDetail,
        master: AssetMaster,
        audit: AuditSubmission,
        site: Site
    ) -> List[Variance]:
        """Process asset found in both physical audit and master data for this site."""
        variances = []

        # Check condition mismatch
        if physical.physical_condition != master.recorded_condition:
            variances.append(Variance(
                audit_id=audit_id,
                serial_number=physical.serial_number,
                variance_type=VarianceType.CONDITION_MISMATCH,
                priority=PriorityLevel.MEDIUM,
                physical_site=audit.site_code,
                current_gl_site=master.assigned_site_code,
                master_condition=master.recorded_condition,
                physical_condition=physical.physical_condition,
                asset_type=physical.asset_type,
                model=physical.model,
                action_required="Update condition code in master database",
                recommended_action=f"Change condition from '{master.recorded_condition}' to '{physical.physical_condition}'",
                email_template=self._generate_condition_update_email(
                    physical, master, audit, site
                ),
            ))
        else:
            # Everything matches - create CORRECT variance for tracking
            variances.append(Variance(
                audit_id=audit_id,
                serial_number=physical.serial_number,
                variance_type=VarianceType.CORRECT,
                priority=PriorityLevel.INFO,
                physical_site=audit.site_code,
                current_gl_site=master.assigned_site_code,
                physical_condition=physical.physical_condition,
                asset_type=physical.asset_type,
                model=physical.model,
                action_required="None - asset properly allocated",
            ))

        return variances

    def _create_misallocated_variance(
        self,
        audit_id: UUID,
        physical: AuditDetail,
        master: AssetMaster,
        audit: AuditSubmission,
        site: Site
    ) -> Variance:
        """Create variance for asset found on-site but allocated to different GL."""
        return Variance(
            audit_id=audit_id,
            serial_number=physical.serial_number,
            variance_type=VarianceType.MISALLOCATED,
            priority=PriorityLevel.HIGH,
            physical_site=audit.site_code,
            current_gl_site=master.assigned_site_code,
            physical_condition=physical.physical_condition,
            asset_type=physical.asset_type,
            model=physical.model,
            monthly_cost_impact=master.cost_per_month,
            action_required=f"Submit GL transfer from {master.assigned_site_code} to {audit.site_code}",
            recommended_action="Submit GL transfer request to IT Asset Management",
            email_template=self._generate_transfer_request_email(
                physical, master, audit, site
            ),
        )

    def _create_untracked_variance(
        self,
        audit_id: UUID,
        physical: AuditDetail,
        audit: AuditSubmission,
        site: Site
    ) -> Variance:
        """Create variance for asset found on-site but not in master database."""
        return Variance(
            audit_id=audit_id,
            serial_number=physical.serial_number,
            variance_type=VarianceType.UNTRACKED,
            priority=PriorityLevel.HIGH,
            physical_site=audit.site_code,
            current_gl_site=None,
            physical_condition=physical.physical_condition,
            asset_type=physical.asset_type,
            model=physical.model,
            action_required=f"Submit request to add asset to master database with GL for {audit.site_code}",
            recommended_action="Contact IT Asset Management to add asset to system",
            email_template=self._generate_addition_request_email(
                physical, audit, site
            ),
        )

    def _create_missing_variance(
        self,
        audit_id: UUID,
        master: AssetMaster,
        audit: AuditSubmission,
        site: Site,
        mdm_info: Optional[Dict]
    ) -> Variance:
        """Create variance for asset in GL but not found during physical audit."""
        last_seen_info = ""
        if mdm_info:
            days = mdm_info.get("days_inactive", 0)
            if days:
                last_seen_info = f"Last seen {days} days ago"
                if days > 90:
                    last_seen_info += " (likely lost/disposed)"

        return Variance(
            audit_id=audit_id,
            serial_number=master.serial_number,
            variance_type=VarianceType.MISSING,
            priority=PriorityLevel.HIGH,
            physical_site=None,
            current_gl_site=master.assigned_site_code,
            master_condition=master.recorded_condition,
            asset_type=master.asset_type,
            model=master.model,
            monthly_cost_impact=master.cost_per_month,
            action_required=f"Investigate and submit GL removal request. {last_seen_info}".strip(),
            recommended_action="Verify asset is truly missing, then submit GL removal to stop charges",
            email_template=self._generate_removal_request_email(
                master, audit, site, last_seen_info
            ),
        )

    def _process_mdm_compliance(
        self,
        audit_id: UUID,
        physical_by_serial: Dict[str, List[AuditDetail]],
        mdm_snapshot: MDMSnapshot
    ) -> List[Variance]:
        """Check MDM compliance for physical assets."""
        variances = []

        mdm_details = self.db.query(MDMDetail).filter(
            MDMDetail.snapshot_id == mdm_snapshot.snapshot_id
        ).all()

        mdm_by_serial = {d.serial_number: d for d in mdm_details}

        for serial, assets in physical_by_serial.items():
            physical = assets[0]

            if serial not in mdm_by_serial:
                variances.append(Variance(
                    audit_id=audit_id,
                    serial_number=serial,
                    variance_type=VarianceType.MDM_NOT_ENROLLED,
                    priority=PriorityLevel.LOW,
                    physical_site=physical.physical_condition,  # Using condition field for site context
                    asset_type=physical.asset_type,
                    model=physical.model,
                    action_required="Submit MDM enrollment request if account requires MDM",
                ))
            else:
                mdm = mdm_by_serial[serial]
                if mdm.days_inactive and mdm.days_inactive >= 45:
                    priority = PriorityLevel.HIGH if mdm.days_inactive >= 55 else PriorityLevel.MEDIUM
                    variances.append(Variance(
                        audit_id=audit_id,
                        serial_number=serial,
                        variance_type=VarianceType.MDM_INACTIVE_WARNING,
                        priority=priority,
                        asset_type=physical.asset_type,
                        model=physical.model,
                        action_required=f"Device inactive for {mdm.days_inactive} days - assign to user to prevent 60-day violation",
                    ))

        return variances

    def _get_mdm_info(self, mdm_snapshot: MDMSnapshot, serial: str) -> Optional[Dict]:
        """Get MDM info for a serial number."""
        mdm = self.db.query(MDMDetail).filter(
            MDMDetail.snapshot_id == mdm_snapshot.snapshot_id,
            MDMDetail.serial_number == serial
        ).first()

        if mdm:
            return {
                "days_inactive": mdm.days_inactive,
                "last_seen_date": mdm.last_seen_date,
                "connection_status": mdm.connection_status,
            }
        return None

    # Email template generation methods

    def _generate_transfer_request_email(
        self,
        physical: AuditDetail,
        master: AssetMaster,
        audit: AuditSubmission,
        site: Site
    ) -> str:
        """Generate pre-filled email for GL transfer request."""
        return f"""To: IT Asset Management
Subject: GL Transfer Request - {physical.serial_number}

Asset Details:
- Serial Number: {physical.serial_number}
- Asset Type: {physical.asset_type}
- Model: {physical.model}
- Current GL: {master.gl_string} ({master.assigned_site_code})
- Transfer To: {audit.site_code}
- Verified On-Site: {audit.audit_date}

Reason: Asset physically located at {site.site_name if site else audit.site_code} during monthly audit conducted on {audit.audit_date}.
Auditor: {audit.auditor_name}

Please process GL transfer to reflect physical location.

[Site Manager Approval: Pending]
"""

    def _generate_removal_request_email(
        self,
        master: AssetMaster,
        audit: AuditSubmission,
        site: Site,
        additional_context: str
    ) -> str:
        """Generate pre-filled email for GL removal request."""
        annual_savings = float(master.cost_per_month or 0) * 12

        return f"""To: IT Asset Management
Subject: GL Removal Request - {master.serial_number}

Asset Details:
- Serial Number: {master.serial_number}
- Asset Type: {master.asset_type}
- Model: {master.model}
- Current GL: {master.gl_string} ({master.assigned_site_code})
- Monthly Cost: ${master.cost_per_month or 0:.2f}

Status: Asset charged to {audit.site_code} GL but NOT found during physical audit on {audit.audit_date}.
{additional_context}

Requested Action: Remove asset from GL string.
Potential Savings: ${master.cost_per_month or 0:.2f}/month (${annual_savings:.2f}/year)

Please investigate and process GL removal if confirmed not on-site.

[Site Manager Approval: Pending]
"""

    def _generate_addition_request_email(
        self,
        physical: AuditDetail,
        audit: AuditSubmission,
        site: Site
    ) -> str:
        """Generate pre-filled email to add untracked asset to master database."""
        return f"""To: IT Asset Management
Subject: Add Asset to Master Database - {physical.serial_number}

Asset Details:
- Serial Number: {physical.serial_number}
- Asset Type: {physical.asset_type}
- Model: {physical.model}
- Condition: {physical.physical_condition}
- Location: {site.site_name if site else audit.site_code}
- Found During Audit: {audit.audit_date}

Status: Asset found on-site but NOT in master asset database or any GL string.

Possible Reasons:
- Recent acquisition not yet recorded
- Transfer from another account not logged
- Loaner device never returned to proper GL

Requested Action: Add asset to master database and assign to {audit.site_code} GL string.

Auditor: {audit.auditor_name}
[Site Manager Approval: Pending]
"""

    def _generate_condition_update_email(
        self,
        physical: AuditDetail,
        master: AssetMaster,
        audit: AuditSubmission,
        site: Site
    ) -> str:
        """Generate email for condition code update."""
        return f"""To: IT Asset Management
Subject: Condition Update Request - {physical.serial_number}

Asset Details:
- Serial Number: {physical.serial_number}
- Asset Type: {physical.asset_type}
- Model: {physical.model}
- Current Recorded Condition: {master.recorded_condition}
- Actual Condition (per audit): {physical.physical_condition}
- Location: {site.site_name if site else audit.site_code}
- Audit Date: {audit.audit_date}

Requested Action: Update condition code from '{master.recorded_condition}' to '{physical.physical_condition}'.

Auditor: {audit.auditor_name}
"""

    def calculate_variance_summary(self, audit_id: UUID) -> Dict:
        """Calculate summary statistics for an audit's variances."""
        variances = self.db.query(Variance).filter(
            Variance.audit_id == audit_id
        ).all()

        audit = self.db.query(AuditSubmission).filter(
            AuditSubmission.audit_id == audit_id
        ).first()

        # Count by type
        by_type = {}
        for vt in VarianceType:
            count = sum(1 for v in variances if v.variance_type == vt)
            by_type[vt.value] = count

        # Count by priority
        by_priority = {}
        for pl in PriorityLevel:
            count = sum(1 for v in variances if v.priority == pl)
            by_priority[pl.value] = count

        # Financial impact
        missing_cost = sum(
            float(v.monthly_cost_impact or 0)
            for v in variances
            if v.variance_type == VarianceType.MISSING
        )

        # GL accuracy calculation
        assets_in_gl = self.db.query(AssetMaster).filter(
            AssetMaster.assigned_site_code == audit.site_code,
            AssetMaster.is_deleted == False
        ).count()

        correct_count = by_type.get(VarianceType.CORRECT.value, 0)
        accuracy_pct = (correct_count / assets_in_gl * 100) if assets_in_gl > 0 else 0

        return {
            "audit_id": str(audit_id),
            "site_code": audit.site_code,
            "audit_date": str(audit.audit_date),
            "summary": {
                "total_variances": len(variances),
                "by_type": by_type,
                "by_priority": by_priority,
                "financial_impact": {
                    "potential_monthly_savings": missing_cost,
                    "assets_to_remove_count": by_type.get(VarianceType.MISSING.value, 0),
                    "assets_to_transfer_count": by_type.get(VarianceType.MISALLOCATED.value, 0),
                    "assets_to_add_count": by_type.get(VarianceType.UNTRACKED.value, 0),
                },
                "gl_accuracy": {
                    "assets_in_gl": assets_in_gl,
                    "correct": correct_count,
                    "accuracy_percentage": round(accuracy_pct, 1),
                },
            },
        }
