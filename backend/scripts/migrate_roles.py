#!/usr/bin/env python3
"""
Migration script to convert old roles to new roles.

Role mapping:
- site_operations → auditor
- site_manager → super_user
- regional_director → super_user (with region-based site assignments preserved)

Run from backend directory: python scripts/migrate_roles.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.user import User, UserRole


def migrate_roles():
    """Migrate old roles to new roles."""
    db = SessionLocal()

    try:
        # Get all users
        users = db.query(User).all()

        migrated_count = 0
        skipped_count = 0

        for user in users:
            old_role = user.role
            new_role = None

            if user.role == UserRole.SITE_OPERATIONS:
                new_role = UserRole.AUDITOR
            elif user.role == UserRole.SITE_MANAGER:
                new_role = UserRole.SUPER_USER
            elif user.role == UserRole.REGIONAL_DIRECTOR:
                new_role = UserRole.SUPER_USER
                # Note: Regional directors keep their assigned_sites/region
            elif user.role in (UserRole.ADMIN, UserRole.AUDITOR, UserRole.SUPER_USER):
                # Already using new roles
                skipped_count += 1
                continue

            if new_role:
                user.role = new_role
                print(f"  {user.email}: {old_role.value} → {new_role.value}")
                migrated_count += 1

        if migrated_count > 0:
            db.commit()
            print(f"\nMigrated {migrated_count} users")

        if skipped_count > 0:
            print(f"Skipped {skipped_count} users (already using new roles)")

        if migrated_count == 0 and skipped_count == 0:
            print("No users found to migrate")

        print("\nRole migration complete!")

    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
        raise
    finally:
        db.close()


def show_current_roles():
    """Display current role distribution."""
    db = SessionLocal()

    try:
        users = db.query(User).all()

        role_counts = {}
        for user in users:
            role = user.role.value
            role_counts[role] = role_counts.get(role, 0) + 1

        print("\nCurrent role distribution:")
        for role, count in sorted(role_counts.items()):
            print(f"  {role}: {count} users")

        print(f"\nTotal users: {len(users)}")

    finally:
        db.close()


if __name__ == "__main__":
    print("Role Migration Script")
    print("=" * 40)

    # Show current state
    show_current_roles()

    # Ask for confirmation
    print("\nThis will migrate:")
    print("  site_operations → auditor")
    print("  site_manager → super_user")
    print("  regional_director → super_user")

    response = input("\nProceed with migration? (y/N): ").strip().lower()

    if response == 'y':
        print("\nMigrating roles...")
        migrate_roles()

        # Show final state
        show_current_roles()
    else:
        print("Migration cancelled.")
