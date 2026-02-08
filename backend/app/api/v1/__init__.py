"""
API v1 package.
"""
from fastapi import APIRouter

from app.api.v1.endpoints import auth, sites, assets, audits, variances, dashboard, it_allocation, master_data, settings, scan_audit

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(sites.router, prefix="/sites", tags=["Sites"])
api_router.include_router(assets.router, prefix="/master-data", tags=["Master Data"])
api_router.include_router(master_data.router, prefix="/assets", tags=["Asset Management"])
api_router.include_router(audits.router, prefix="/audits", tags=["Audits"])
api_router.include_router(variances.router, prefix="/variances", tags=["Variances"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(it_allocation.router, prefix="/it-allocation", tags=["IT Allocation"])
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"])
api_router.include_router(scan_audit.router, prefix="/scan", tags=["Scan Audit"])
