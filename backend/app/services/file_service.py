"""
File processing service for Excel/CSV uploads.
"""
import os
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Tuple, Optional, BinaryIO
from uuid import UUID
import pandas as pd
from sqlalchemy.orm import Session

from app.models.asset import AssetMaster
from app.models.audit import AuditSubmission, AuditDetail, ProcessingStatus
from app.models.mdm import MDMSnapshot, MDMDetail
from app.core.config import settings


class FileService:
    """Service for processing uploaded files."""

    REQUIRED_AUDIT_COLUMNS = ["serial_number", "asset_type", "model", "condition"]
    REQUIRED_MASTER_COLUMNS = [
        "serial_number", "asset_type", "model", "assigned_site_code", "gl_string"
    ]
    VALID_CONDITIONS = ["Good", "Bad", "RMA", "Lost"]

    def __init__(self, db: Session):
        self.db = db

    def validate_file_extension(self, filename: str) -> Tuple[bool, str]:
        """Validate file has allowed extension."""
        ext = os.path.splitext(filename)[1].lower()
        if ext not in settings.ALLOWED_EXTENSIONS:
            return False, f"Invalid file type. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        return True, ""

    def parse_audit_file(
        self,
        file: BinaryIO,
        filename: str
    ) -> Tuple[Optional[pd.DataFrame], List[Dict], List[Dict]]:
        """
        Parse physical audit Excel/CSV file.
        Returns (dataframe, errors, warnings).
        """
        errors = []
        warnings = []

        try:
            ext = os.path.splitext(filename)[1].lower()
            if ext == ".csv":
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file, engine="openpyxl")
        except Exception as e:
            errors.append({"row": 0, "field": "file", "message": f"Could not read file: {str(e)}"})
            return None, errors, warnings

        # Normalize column names
        df.columns = [self._normalize_column_name(col) for col in df.columns]

        # Check required columns
        missing_cols = [col for col in self.REQUIRED_AUDIT_COLUMNS if col not in df.columns]
        if missing_cols:
            errors.append({
                "row": 0,
                "field": "columns",
                "message": f"Missing required columns: {', '.join(missing_cols)}"
            })
            return None, errors, warnings

        # Validate each row
        for idx, row in df.iterrows():
            row_num = idx + 2  # Account for header and 0-index

            # Check serial number
            if pd.isna(row.get("serial_number")) or str(row["serial_number"]).strip() == "":
                errors.append({
                    "row": row_num,
                    "field": "serial_number",
                    "message": "Serial number is required"
                })
                continue

            # Check asset type
            if pd.isna(row.get("asset_type")) or str(row["asset_type"]).strip() == "":
                errors.append({
                    "row": row_num,
                    "field": "asset_type",
                    "message": "Asset type is required"
                })

            # Check model
            if pd.isna(row.get("model")) or str(row["model"]).strip() == "":
                errors.append({
                    "row": row_num,
                    "field": "model",
                    "message": "Model is required"
                })

            # Check condition
            condition = str(row.get("condition", "")).strip()
            if not condition:
                errors.append({
                    "row": row_num,
                    "field": "condition",
                    "message": "Condition is required"
                })
            elif condition not in self.VALID_CONDITIONS:
                errors.append({
                    "row": row_num,
                    "field": "condition",
                    "message": f"Invalid condition. Must be: {', '.join(self.VALID_CONDITIONS)}"
                })

        # Check for duplicate serials (warning, not error)
        serial_counts = df["serial_number"].value_counts()
        duplicates = serial_counts[serial_counts > 1]
        for serial, count in duplicates.items():
            warnings.append({
                "row": 0,
                "field": "serial_number",
                "message": f"Serial '{serial}' appears {count} times in file"
            })

        return df, errors, warnings

    def process_audit_upload(
        self,
        df: pd.DataFrame,
        audit: AuditSubmission
    ) -> int:
        """
        Process validated audit dataframe and create audit details.
        Returns count of records created.
        """
        # Track serials for duplicate detection
        seen_serials: Dict[str, int] = {}
        created = 0

        for idx, row in df.iterrows():
            row_num = idx + 2
            serial = str(row["serial_number"]).strip()

            # Check for duplicate
            is_duplicate = serial in seen_serials
            duplicate_of = seen_serials.get(serial)

            detail = AuditDetail(
                audit_id=audit.audit_id,
                row_number=row_num,
                serial_number=serial,
                asset_type=str(row["asset_type"]).strip(),
                model=str(row["model"]).strip(),
                physical_condition=str(row["condition"]).strip(),
                location_notes=str(row.get("location_notes", "")).strip() or None,
                is_duplicate=is_duplicate,
                duplicate_of_row=duplicate_of,
            )

            self.db.add(detail)
            created += 1

            if not is_duplicate:
                seen_serials[serial] = row_num

        audit.total_assets_found = len(df)
        self.db.commit()

        return created

    def parse_master_data_file(
        self,
        file: BinaryIO,
        filename: str
    ) -> Tuple[Optional[pd.DataFrame], List[Dict], List[Dict]]:
        """
        Parse master data Excel/CSV file.
        Returns (dataframe, errors, warnings).
        """
        errors = []
        warnings = []

        try:
            ext = os.path.splitext(filename)[1].lower()
            if ext == ".csv":
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file, engine="openpyxl")
        except Exception as e:
            errors.append({"row": 0, "field": "file", "message": f"Could not read file: {str(e)}"})
            return None, errors, warnings

        # Normalize column names
        df.columns = [self._normalize_column_name(col) for col in df.columns]

        # Check required columns
        missing_cols = [col for col in self.REQUIRED_MASTER_COLUMNS if col not in df.columns]
        if missing_cols:
            errors.append({
                "row": 0,
                "field": "columns",
                "message": f"Missing required columns: {', '.join(missing_cols)}"
            })
            return None, errors, warnings

        # Validate each row
        for idx, row in df.iterrows():
            row_num = idx + 2

            for col in self.REQUIRED_MASTER_COLUMNS:
                if pd.isna(row.get(col)) or str(row[col]).strip() == "":
                    errors.append({
                        "row": row_num,
                        "field": col,
                        "message": f"{col} is required"
                    })

            # Validate condition if present
            condition = row.get("recorded_condition")
            if condition and not pd.isna(condition):
                condition = str(condition).strip()
                if condition and condition not in self.VALID_CONDITIONS:
                    warnings.append({
                        "row": row_num,
                        "field": "recorded_condition",
                        "message": f"Invalid condition '{condition}'. Will be set to None."
                    })

            # Validate cost if present
            cost = row.get("cost_per_month")
            if cost and not pd.isna(cost):
                try:
                    Decimal(str(cost))
                except (InvalidOperation, ValueError):
                    warnings.append({
                        "row": row_num,
                        "field": "cost_per_month",
                        "message": f"Invalid cost '{cost}'. Will be set to None."
                    })

        return df, errors, warnings

    def process_master_data_upload(
        self,
        df: pd.DataFrame,
        uploaded_by: str
    ) -> Dict:
        """
        Process master data upload - creates or updates records.
        Returns summary dict.
        """
        created = 0
        updated = 0
        errors = []

        for idx, row in df.iterrows():
            row_num = idx + 2
            serial = str(row["serial_number"]).strip()
            site_code = str(row["assigned_site_code"]).strip()

            try:
                # Check for existing record
                existing = self.db.query(AssetMaster).filter(
                    AssetMaster.serial_number == serial,
                    AssetMaster.assigned_site_code == site_code,
                    AssetMaster.is_deleted == False
                ).first()

                # Parse optional fields
                acquisition_date = None
                if "acquisition_date" in row and not pd.isna(row["acquisition_date"]):
                    try:
                        acquisition_date = pd.to_datetime(row["acquisition_date"]).date()
                    except Exception:
                        pass

                recorded_condition = None
                if "recorded_condition" in row and not pd.isna(row["recorded_condition"]):
                    cond = str(row["recorded_condition"]).strip()
                    if cond in self.VALID_CONDITIONS:
                        recorded_condition = cond

                cost_per_month = None
                if "cost_per_month" in row and not pd.isna(row["cost_per_month"]):
                    try:
                        cost_per_month = Decimal(str(row["cost_per_month"]))
                    except Exception:
                        pass

                if existing:
                    # Update existing record
                    existing.asset_type = str(row["asset_type"]).strip()
                    existing.model = str(row["model"]).strip()
                    existing.gl_string = str(row["gl_string"]).strip()
                    existing.acquisition_date = acquisition_date
                    existing.recorded_condition = recorded_condition
                    existing.cost_per_month = cost_per_month
                    existing.updated_by = uploaded_by
                    updated += 1
                else:
                    # Create new record
                    asset = AssetMaster(
                        serial_number=serial,
                        asset_type=str(row["asset_type"]).strip(),
                        model=str(row["model"]).strip(),
                        assigned_site_code=site_code,
                        gl_string=str(row["gl_string"]).strip(),
                        acquisition_date=acquisition_date,
                        recorded_condition=recorded_condition,
                        cost_per_month=cost_per_month,
                        updated_by=uploaded_by,
                    )
                    self.db.add(asset)
                    created += 1

            except Exception as e:
                errors.append({
                    "row": row_num,
                    "field": "record",
                    "message": str(e)
                })

        self.db.commit()

        return {
            "total_records": len(df),
            "created": created,
            "updated": updated,
            "errors": errors,
            "warnings": [],
        }

    def parse_mdm_file(
        self,
        file: BinaryIO,
        filename: str
    ) -> Tuple[Optional[pd.DataFrame], List[Dict]]:
        """Parse MDM export file."""
        errors = []

        try:
            ext = os.path.splitext(filename)[1].lower()
            if ext == ".csv":
                df = pd.read_csv(file)
            else:
                df = pd.read_excel(file, engine="openpyxl")
        except Exception as e:
            errors.append({"row": 0, "field": "file", "message": f"Could not read file: {str(e)}"})
            return None, errors

        df.columns = [self._normalize_column_name(col) for col in df.columns]

        if "serial_number" not in df.columns:
            errors.append({
                "row": 0,
                "field": "columns",
                "message": "Missing required column: serial_number"
            })
            return None, errors

        return df, errors

    def process_mdm_upload(
        self,
        df: pd.DataFrame,
        audit_id: UUID,
        filename: str
    ) -> MDMSnapshot:
        """Process MDM data upload and link to audit."""
        snapshot = MDMSnapshot(
            audit_id=audit_id,
            file_name=filename,
            total_records=len(df),
        )
        self.db.add(snapshot)
        self.db.flush()

        for idx, row in df.iterrows():
            serial = str(row["serial_number"]).strip()

            # Calculate days inactive
            days_inactive = None
            last_seen = None
            if "last_seen_date" in row and not pd.isna(row["last_seen_date"]):
                try:
                    last_seen = pd.to_datetime(row["last_seen_date"]).date()
                    days_inactive = (date.today() - last_seen).days
                except Exception:
                    pass

            detail = MDMDetail(
                snapshot_id=snapshot.snapshot_id,
                serial_number=serial,
                connection_status=str(row.get("connection_status", "")).strip() or None,
                last_seen_date=last_seen,
                days_inactive=days_inactive,
                device_name=str(row.get("device_name", "")).strip() or None,
                enrollment_status=str(row.get("enrollment_status", "")).strip() or None,
            )
            self.db.add(detail)

        self.db.commit()
        return snapshot

    def _normalize_column_name(self, col: str) -> str:
        """Normalize column name to snake_case."""
        return str(col).lower().strip().replace(" ", "_").replace("-", "_")
