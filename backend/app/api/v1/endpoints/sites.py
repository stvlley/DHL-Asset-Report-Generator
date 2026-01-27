"""
Sites management endpoints.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.site import Site
from app.schemas.site import SiteCreate, SiteUpdate, SiteResponse
from app.services.auth_service import AuthService


router = APIRouter()


@router.get("", response_model=List[SiteResponse])
async def list_sites(
    account_name: Optional[str] = None,
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all sites (filtered by user access)."""
    auth_service = AuthService(db)

    query = db.query(Site).filter(Site.is_active == True)

    if account_name:
        query = query.filter(Site.account_name == account_name)
    if region:
        query = query.filter(Site.region == region)

    # Filter by user access unless admin
    if not auth_service.check_permission(current_user, "view_all_sites"):
        if current_user.assigned_sites:
            query = query.filter(Site.site_code.in_(current_user.assigned_sites))
        else:
            return []

    return query.order_by(Site.site_code).all()


@router.get("/{site_code}", response_model=SiteResponse)
async def get_site(
    site_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get site by code."""
    auth_service = AuthService(db)

    site = db.query(Site).filter(Site.site_code == site_code).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )

    # Check access
    if not auth_service.check_permission(current_user, "view_all_sites"):
        if site_code not in (current_user.assigned_sites or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this site"
            )

    return site


@router.post("", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
async def create_site(
    site_data: SiteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create new site (admin only)."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "view_all_sites"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    # Check if site exists
    existing = db.query(Site).filter(Site.site_code == site_data.site_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Site code already exists"
        )

    site = Site(**site_data.model_dump())
    db.add(site)
    db.commit()
    db.refresh(site)

    return site


@router.put("/{site_code}", response_model=SiteResponse)
async def update_site(
    site_code: str,
    site_data: SiteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update site (admin only)."""
    auth_service = AuthService(db)

    if not auth_service.check_permission(current_user, "view_all_sites"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    site = db.query(Site).filter(Site.site_code == site_code).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )

    update_data = site_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(site, field, value)

    db.commit()
    db.refresh(site)

    return site
