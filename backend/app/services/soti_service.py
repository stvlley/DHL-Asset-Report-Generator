"""
SOTI MobiControl API integration service.
Handles OAuth2 authentication and device status sync.
"""
import json
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from app.models.asset import AssetMaster, MDMEnrollmentStatus


class SOTIConfig:
    """Configuration for SOTI MobiControl API."""

    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        username: str,
        password: str
    ):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.username = username
        self.password = password
        self.api_prefix = "/MobiControl/api"


class SOTIService:
    """
    Service for integrating with SOTI MobiControl API.

    SOTI API uses OAuth2 Resource Owner grant for authentication.
    API docs: https://[instance].mobicontrolcloud.com/mobicontrol/api/docs/
    """

    def __init__(self, db: Session, config: Optional[SOTIConfig] = None):
        self.db = db
        self.config = config
        self._access_token: Optional[str] = None
        self._token_expires: Optional[datetime] = None

    def configure(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        username: str,
        password: str
    ):
        """Configure SOTI connection."""
        self.config = SOTIConfig(
            base_url=base_url,
            client_id=client_id,
            client_secret=client_secret,
            username=username,
            password=password
        )

    def is_configured(self) -> bool:
        """Check if SOTI integration is configured."""
        return self.config is not None

    async def authenticate(self) -> bool:
        """
        Authenticate with SOTI using OAuth2 Resource Owner grant.

        Returns:
            True if authentication successful
        """
        if not self.config:
            raise ValueError("SOTI not configured")

        token_url = f"{self.config.base_url}{self.config.api_prefix}/token"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    token_url,
                    data={
                        "grant_type": "password",
                        "username": self.config.username,
                        "password": self.config.password,
                        "client_id": self.config.client_id,
                        "client_secret": self.config.client_secret
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )

                if response.status_code == 200:
                    data = response.json()
                    self._access_token = data.get("access_token")
                    expires_in = data.get("expires_in", 3600)
                    self._token_expires = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
                    return True
                else:
                    return False

            except Exception as e:
                print(f"SOTI auth error: {e}")
                return False

    async def _ensure_authenticated(self):
        """Ensure we have a valid access token."""
        if not self._access_token or (
            self._token_expires and datetime.now(timezone.utc) >= self._token_expires
        ):
            success = await self.authenticate()
            if not success:
                raise ValueError("Failed to authenticate with SOTI")

    async def _api_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None
    ) -> Dict:
        """Make an authenticated API request to SOTI."""
        await self._ensure_authenticated()

        url = f"{self.config.base_url}{self.config.api_prefix}{endpoint}"

        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                url,
                params=params,
                json=data,
                headers={
                    "Authorization": f"Bearer {self._access_token}",
                    "Content-Type": "application/json"
                },
                timeout=30.0
            )

            if response.status_code == 401:
                # Token expired, re-authenticate and retry
                await self.authenticate()
                response = await client.request(
                    method,
                    url,
                    params=params,
                    json=data,
                    headers={
                        "Authorization": f"Bearer {self._access_token}",
                        "Content-Type": "application/json"
                    },
                    timeout=30.0
                )

            response.raise_for_status()
            return response.json()

    async def get_devices(
        self,
        skip: int = 0,
        take: int = 100,
        filter_expr: Optional[str] = None
    ) -> List[Dict]:
        """
        Get devices from SOTI MobiControl.

        Args:
            skip: Number of records to skip
            take: Number of records to return
            filter_expr: Optional filter expression (e.g., "DeviceName like 'Scanner%'")

        Returns:
            List of device records
        """
        params = {"skip": skip, "take": take}
        if filter_expr:
            params["filter"] = filter_expr

        result = await self._api_request("GET", "/devices", params=params)
        return result if isinstance(result, list) else result.get("devices", [])

    async def search_devices(
        self,
        search_expr: str,
        skip: int = 0,
        take: int = 100
    ) -> List[Dict]:
        """
        Search devices using advanced search expression.

        Args:
            search_expr: Advanced search expression
                Examples:
                - "SerialNumber='ABC123'"
                - "LastAgentConnectTime < DateAdd(day, -30, Now())"
                - "EnrollmentStatus='Enrolled' AND Platform='Android'"

        Returns:
            List of matching devices
        """
        params = {"filter": search_expr, "skip": skip, "take": take}
        result = await self._api_request("GET", "/devices/search", params=params)
        return result if isinstance(result, list) else result.get("devices", [])

    async def get_device_by_serial(self, serial_number: str) -> Optional[Dict]:
        """Look up a device by serial number."""
        try:
            devices = await self.search_devices(f"SerialNumber='{serial_number}'", take=1)
            return devices[0] if devices else None
        except Exception:
            return None

    async def get_device_by_id(self, device_id: str) -> Optional[Dict]:
        """Get a device by its SOTI device ID."""
        try:
            result = await self._api_request("GET", f"/devices/{device_id}")
            return result
        except Exception:
            return None

    async def get_disconnected_devices(self, days: int = 30) -> List[Dict]:
        """Get devices that haven't connected in X days."""
        search_expr = f"LastAgentConnectTime < DateAdd(day, -{days}, Now()) AND EnrollmentStatus='Enrolled'"
        return await self.search_devices(search_expr, take=1000)

    def _parse_device_data(self, soti_device: Dict) -> Dict[str, Any]:
        """Parse SOTI device data into our format."""
        last_connect = soti_device.get("LastAgentConnectTime")
        last_connect_dt = None
        days_since = None

        if last_connect:
            try:
                # SOTI uses ISO format
                last_connect_dt = datetime.fromisoformat(last_connect.replace("Z", "+00:00"))
                days_since = (datetime.now(timezone.utc) - last_connect_dt).days
            except Exception:
                pass

        enrollment_status = soti_device.get("EnrollmentStatus", "").lower()
        if enrollment_status == "enrolled":
            mdm_status = MDMEnrollmentStatus.ENROLLED.value
        elif enrollment_status == "unenrolled":
            mdm_status = MDMEnrollmentStatus.UNENROLLED.value
        elif enrollment_status == "pending":
            mdm_status = MDMEnrollmentStatus.PENDING.value
        else:
            mdm_status = MDMEnrollmentStatus.UNKNOWN.value

        return {
            "mdm_device_id": soti_device.get("DeviceId"),
            "mdm_device_name": soti_device.get("DeviceName"),
            "serial_number": soti_device.get("SerialNumber"),
            "mac_address": soti_device.get("MacAddress"),
            "imei": soti_device.get("Imei"),
            "mdm_enrollment_status": mdm_status,
            "mdm_last_seen": last_connect_dt,
            "mdm_days_since_connect": days_since,
            "mdm_os_version": soti_device.get("OsVersion"),
            "mdm_agent_version": soti_device.get("AgentVersion"),
            "mdm_battery_level": soti_device.get("BatteryLevel"),
            "mdm_compliance_status": soti_device.get("ComplianceStatus"),
            "mdm_raw_data": json.dumps(soti_device)
        }

    async def sync_device_status(self, asset: AssetMaster) -> bool:
        """
        Sync MDM status for a single asset.

        Args:
            asset: The asset to sync

        Returns:
            True if device found and synced
        """
        # Try to find device by various identifiers
        soti_device = None

        if asset.mdm_device_id:
            soti_device = await self.get_device_by_id(asset.mdm_device_id)

        if not soti_device and asset.serial_number:
            soti_device = await self.get_device_by_serial(asset.serial_number)

        if not soti_device and asset.hsn:
            soti_device = await self.get_device_by_serial(asset.hsn)

        if not soti_device:
            asset.mdm_enrollment_status = MDMEnrollmentStatus.NOT_ENROLLED.value
            asset.mdm_last_sync = datetime.now(timezone.utc)
            self.db.commit()
            return False

        # Update asset with SOTI data
        parsed = self._parse_device_data(soti_device)
        for key, value in parsed.items():
            if value is not None:
                setattr(asset, key, value)

        asset.mdm_last_sync = datetime.now(timezone.utc)
        self.db.commit()
        return True

    async def sync_all_assets(
        self,
        site_code: Optional[str] = None,
        batch_size: int = 50
    ) -> Dict[str, int]:
        """
        Sync MDM status for all assets.

        Args:
            site_code: Optional - only sync assets at this site
            batch_size: Number of assets to sync per batch

        Returns:
            Summary stats
        """
        query = self.db.query(AssetMaster).filter(AssetMaster.is_deleted == False)

        if site_code:
            query = query.filter(AssetMaster.assigned_site_code == site_code)

        assets = query.all()

        stats = {"total": len(assets), "synced": 0, "not_found": 0, "errors": 0}

        for asset in assets:
            try:
                found = await self.sync_device_status(asset)
                if found:
                    stats["synced"] += 1
                else:
                    stats["not_found"] += 1
            except Exception as e:
                stats["errors"] += 1
                print(f"Error syncing asset {asset.serial_number}: {e}")

        return stats

    async def bulk_import_from_soti(
        self,
        site_code: str,
        gl_string: str,
        filter_expr: Optional[str] = None
    ) -> Dict[str, int]:
        """
        Import devices from SOTI into AssetMaster.

        Args:
            site_code: Site to assign devices to
            gl_string: GL string for the devices
            filter_expr: Optional SOTI filter expression

        Returns:
            Import stats
        """
        devices = await self.get_devices(take=1000, filter_expr=filter_expr)

        stats = {"total": len(devices), "created": 0, "updated": 0, "skipped": 0}

        for soti_device in devices:
            parsed = self._parse_device_data(soti_device)
            serial = parsed.get("serial_number")

            if not serial:
                stats["skipped"] += 1
                continue

            # Check if exists
            existing = self.db.query(AssetMaster).filter(
                AssetMaster.serial_number == serial,
                AssetMaster.assigned_site_code == site_code,
                AssetMaster.is_deleted == False
            ).first()

            if existing:
                # Update with SOTI data
                for key, value in parsed.items():
                    if value is not None:
                        setattr(existing, key, value)
                existing.mdm_last_sync = datetime.now(timezone.utc)
                stats["updated"] += 1
            else:
                # Create new asset
                asset = AssetMaster(
                    serial_number=serial,
                    assigned_site_code=site_code,
                    asset_type="RF Scanner",  # Default, can be updated
                    model=soti_device.get("Model", "Unknown"),
                    manufacturer=soti_device.get("Manufacturer"),
                    gl_string=gl_string,
                    source="mdm_sync",
                    **{k: v for k, v in parsed.items() if v is not None}
                )
                asset.mdm_last_sync = datetime.now(timezone.utc)
                self.db.add(asset)
                stats["created"] += 1

        self.db.commit()
        return stats


# Placeholder for sync function that can be called from CLI/scheduler
async def run_soti_sync(db: Session, config: SOTIConfig, site_code: Optional[str] = None):
    """Run SOTI sync for all or specific site."""
    service = SOTIService(db, config)
    return await service.sync_all_assets(site_code)
