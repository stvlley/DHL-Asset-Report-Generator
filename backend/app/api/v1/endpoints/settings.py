"""
System settings API endpoints.
Manage SOTI configuration, feature flags, etc.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.services.auth_service import AuthService
from app.core.soti_config import SOTIConfigManager


router = APIRouter()


class SOTIConfigRequest(BaseModel):
    base_url: str
    client_id: str
    client_secret: str
    username: str
    password: str


class SOTITestResult(BaseModel):
    success: bool
    message: str
    device_count: Optional[int] = None


@router.get("/soti/status")
async def get_soti_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get SOTI integration status.

    Returns whether SOTI is configured and ready for use.
    If not configured, manual PBI imports can still be used.
    """
    config_manager = SOTIConfigManager(db)
    return config_manager.get_status()


@router.post("/soti/configure")
async def configure_soti(
    config: SOTIConfigRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Configure SOTI API credentials.

    Admin only. Saves credentials to database for API integration.
    """
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_settings"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    config_manager = SOTIConfigManager(db)
    success = config_manager.save_credentials(
        base_url=config.base_url,
        client_id=config.client_id,
        client_secret=config.client_secret,
        username=config.username,
        password=config.password
    )

    if success:
        return {
            "status": "success",
            "message": "SOTI credentials saved",
            **config_manager.get_status()
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save SOTI credentials"
        )


@router.post("/soti/test")
async def test_soti_connection(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Test SOTI API connection.

    Attempts to authenticate and fetch a single device to verify credentials.
    """
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_settings"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    config_manager = SOTIConfigManager(db)
    creds = config_manager.get_credentials()

    if not creds or not creds.is_valid():
        return SOTITestResult(
            success=False,
            message="SOTI not configured. Please save credentials first."
        )

    try:
        from app.services.soti_service import SOTIService, SOTIConfig

        soti_config = SOTIConfig(
            base_url=creds.base_url,
            client_id=creds.client_id,
            client_secret=creds.client_secret,
            username=creds.username,
            password=creds.password
        )

        service = SOTIService(db, soti_config)

        # Try to authenticate
        import asyncio
        loop = asyncio.get_event_loop()
        auth_success = loop.run_until_complete(service.authenticate())

        if not auth_success:
            return SOTITestResult(
                success=False,
                message="Authentication failed. Check credentials."
            )

        # Try to get devices
        devices = loop.run_until_complete(service.get_devices(take=1))

        return SOTITestResult(
            success=True,
            message="Successfully connected to SOTI MobiControl",
            device_count=len(devices) if devices else 0
        )

    except Exception as e:
        return SOTITestResult(
            success=False,
            message=f"Connection error: {str(e)}"
        )


@router.delete("/soti/configure")
async def clear_soti_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Clear SOTI API credentials.

    Admin only. Removes saved credentials and disables API integration.
    Manual PBI imports will still work.
    """
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "manage_settings"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    config_manager = SOTIConfigManager(db)
    success = config_manager.clear_credentials()

    if success:
        return {
            "status": "success",
            "message": "SOTI credentials cleared. Using manual PBI imports.",
            **config_manager.get_status()
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear SOTI credentials"
        )


@router.get("/mdm/status")
async def get_mdm_integration_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get MDM integration status and options.

    Returns available MDM data sources:
    - SOTI API (if configured)
    - Manual PBI Import (always available)
    """
    config_manager = SOTIConfigManager(db)
    soti_status = config_manager.get_status()

    return {
        "sources": {
            "soti_api": {
                "available": soti_status["configured"],
                "status": soti_status
            },
            "manual_pbi_import": {
                "available": True,
                "description": "Import PBI/SOTI export via Excel workbook"
            }
        },
        "recommended": "soti_api" if soti_status["configured"] else "manual_pbi_import",
        "message": (
            "SOTI API integration active" if soti_status["configured"]
            else "Using manual PBI imports. Configure SOTI API for automatic sync."
        )
    }
