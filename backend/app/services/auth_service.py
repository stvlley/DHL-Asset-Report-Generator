"""
Authentication service for user management and login.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.core.security import (
    verify_password,
    get_password_hash,
    validate_password_strength,
    create_access_token,
    create_refresh_token,
    decode_token,
    create_password_reset_token,
    verify_password_reset_token,
)
from app.core.config import settings
from app.schemas.user import UserCreate, Token


class AuthService:
    """Service for authentication and user management."""

    def __init__(self, db: Session):
        self.db = db

    def authenticate_user(self, email: str, password: str) -> Tuple[Optional[User], Optional[str]]:
        """
        Authenticate user and return (user, error_message).
        Handles account lockout after failed attempts.
        """
        user = self.db.query(User).filter(User.email == email).first()

        if not user:
            return None, "Invalid email or password"

        if not user.is_active:
            return None, "Account is disabled"

        if user.is_locked():
            minutes_remaining = int(
                (user.locked_until - datetime.now(timezone.utc)).total_seconds() / 60
            )
            return None, f"Account locked. Try again in {minutes_remaining} minutes"

        if not user.hashed_password:
            return None, "SSO login required for this account"

        if not verify_password(password, user.hashed_password):
            attempts = user.increment_failed_attempts()

            if attempts >= settings.MAX_LOGIN_ATTEMPTS:
                user.locked_until = datetime.now(timezone.utc) + timedelta(
                    minutes=settings.LOCKOUT_DURATION_MINUTES
                )

            self.db.commit()
            return None, "Invalid email or password"

        # Successful login
        user.reset_failed_attempts()
        user.last_login = datetime.now(timezone.utc)
        self.db.commit()

        return user, None

    def create_tokens(self, user: User) -> Token:
        """Create access and refresh tokens for user."""
        token_data = {
            "sub": str(user.user_id),
            "email": user.email,
            "role": user.role.value,
        }

        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    def refresh_access_token(self, refresh_token: str) -> Optional[Token]:
        """Refresh access token using refresh token."""
        payload = decode_token(refresh_token)

        if not payload or payload.get("type") != "refresh":
            return None

        user_id = payload.get("sub")
        user = self.db.query(User).filter(User.user_id == user_id).first()

        if not user or not user.is_active:
            return None

        return self.create_tokens(user)

    def create_user(self, user_data: UserCreate) -> Tuple[Optional[User], Optional[str]]:
        """Create new user account."""
        # Check if email exists
        existing = self.db.query(User).filter(User.email == user_data.email).first()
        if existing:
            return None, "Email already registered"

        # Validate password strength
        is_valid, error_msg = validate_password_strength(user_data.password)
        if not is_valid:
            return None, error_msg

        user = User(
            email=user_data.email,
            hashed_password=get_password_hash(user_data.password),
            full_name=user_data.full_name,
            role=user_data.role,
            assigned_sites=user_data.assigned_sites,
            assigned_region=user_data.assigned_region,
            password_changed_at=datetime.now(timezone.utc),
        )

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        return user, None

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        return self.db.query(User).filter(User.user_id == str(user_id)).first()

    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        return self.db.query(User).filter(User.email == email).first()

    def request_password_reset(self, email: str) -> Optional[str]:
        """
        Generate password reset token.
        Returns token if user exists, None otherwise.
        Note: In production, always return success to prevent email enumeration.
        """
        user = self.get_user_by_email(email)
        if not user:
            return None

        return create_password_reset_token(email)

    def reset_password(self, token: str, new_password: str) -> Tuple[bool, str]:
        """Reset password using reset token."""
        email = verify_password_reset_token(token)
        if not email:
            return False, "Invalid or expired reset token"

        user = self.get_user_by_email(email)
        if not user:
            return False, "User not found"

        # Validate password strength
        is_valid, error_msg = validate_password_strength(new_password)
        if not is_valid:
            return False, error_msg

        user.hashed_password = get_password_hash(new_password)
        user.password_changed_at = datetime.now(timezone.utc)
        user.reset_failed_attempts()
        self.db.commit()

        return True, "Password reset successfully"

    def check_permission(
        self,
        user: User,
        permission: str,
        site_code: Optional[str] = None
    ) -> bool:
        """Check if user has permission, optionally for specific site."""
        PERMISSIONS = {
            UserRole.ADMIN: [
                "view_all_sites",
                "upload_master_data",
                "manage_users",
                "view_audit_log",
                "delete_audits",
                "upload_audit",
                "view_reports",
                "approve_action_items",
                "update_action_items",
            ],
            UserRole.REGIONAL_DIRECTOR: [
                "view_region_sites",
                "view_all_reports",
                "view_dashboard",
                "view_reports",
            ],
            UserRole.SITE_MANAGER: [
                "view_own_site",
                "approve_action_items",
                "view_reports",
                "upload_audit",
                "update_action_items",
            ],
            UserRole.SITE_OPERATIONS: [
                "upload_audit",
                "view_own_site",
                "update_action_items",
                "view_reports",
            ],
        }

        if permission not in PERMISSIONS.get(user.role, []):
            return False

        # Site-specific access check
        if site_code:
            if user.role in (UserRole.SITE_OPERATIONS, UserRole.SITE_MANAGER):
                if site_code not in (user.assigned_sites or []):
                    return False

        return True
