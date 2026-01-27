"""
Authentication endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token, oauth2_scheme
from app.services.auth_service import AuthService
from app.services.audit_log_service import AuditLogService
from app.schemas.user import (
    UserCreate,
    UserResponse,
    UserLogin,
    Token,
    TokenRefresh,
    PasswordResetRequest,
    PasswordReset,
)
from app.models.user import User


router = APIRouter()


def get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Dependency to get current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if not payload:
        raise credentials_exception

    if payload.get("type") != "access":
        raise credentials_exception

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception

    auth_service = AuthService(db)
    user = auth_service.get_user_by_id(user_id)

    if not user or not user.is_active:
        raise credentials_exception

    return user


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Login with email and password.
    Returns access and refresh tokens.
    """
    auth_service = AuthService(db)
    audit_log = AuditLogService(db)
    ip = get_client_ip(request)

    user, error = auth_service.authenticate_user(form_data.username, form_data.password)

    if error:
        # Log failed attempt
        if user:
            audit_log.log_login(user.user_id, success=False, ip_address=ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error,
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Log successful login
    audit_log.log_login(user.user_id, success=True, ip_address=ip)

    return auth_service.create_tokens(user)


@router.post("/refresh", response_model=Token)
async def refresh_token(
    token_data: TokenRefresh,
    db: Session = Depends(get_db)
):
    """
    Refresh access token using refresh token.
    """
    auth_service = AuthService(db)
    tokens = auth_service.refresh_access_token(token_data.refresh_token)

    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    return tokens


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """
    Logout current user.
    Note: With JWT, actual token invalidation requires a blocklist.
    For MVP, client should discard tokens.
    """
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user profile."""
    return current_user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    """
    Register new user account.
    Note: In production, this should be admin-only or require invitation.
    """
    auth_service = AuthService(db)
    user, error = auth_service.create_user(user_data)

    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error,
        )

    return user


@router.post("/password-reset/request")
async def request_password_reset(
    reset_request: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """
    Request password reset email.
    Always returns success to prevent email enumeration.
    """
    auth_service = AuthService(db)
    token = auth_service.request_password_reset(reset_request.email)

    # In production, send email with token
    # For MVP, we return the token (remove in production!)
    if token:
        return {
            "message": "If an account exists with this email, a reset link has been sent.",
            "debug_token": token,  # REMOVE IN PRODUCTION
        }

    return {"message": "If an account exists with this email, a reset link has been sent."}


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    reset_data: PasswordReset,
    db: Session = Depends(get_db)
):
    """
    Reset password using reset token.
    """
    auth_service = AuthService(db)
    success, message = auth_service.reset_password(reset_data.token, reset_data.new_password)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        )

    return {"message": message}
