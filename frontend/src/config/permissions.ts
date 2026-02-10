/**
 * Role-based permissions configuration.
 * Mirrors the backend permission model for frontend UI decisions.
 */
import type { UserRole } from '../types'

// All available permissions
export type Permission =
  | 'view_all_sites'
  | 'view_assigned_sites'
  | 'upload_master_data'
  | 'manage_assets'
  | 'manage_settings'
  | 'manage_users'
  | 'view_audit_log'
  | 'delete_audits'
  | 'upload_audit'
  | 'start_scan_session'
  | 'submit_audit'
  | 'view_reports'
  | 'approve_action_items'
  | 'update_action_items'
  | 'upload_it_allocation'
  | 'upload_pbi_import'
  | 'send_reports'
  | 'approve_audits'
  | 'manage_site_data'
  | 'configure_workflow_settings'

// Permission lists by role
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // Admin has all permissions
  admin: [
    'view_all_sites',
    'view_assigned_sites',
    'upload_master_data',
    'manage_assets',
    'manage_settings',
    'manage_users',
    'view_audit_log',
    'delete_audits',
    'upload_audit',
    'start_scan_session',
    'submit_audit',
    'view_reports',
    'approve_action_items',
    'update_action_items',
    'upload_it_allocation',
    'upload_pbi_import',
    'send_reports',
    'approve_audits',
    'manage_site_data',
    'configure_workflow_settings',
  ],

  // Super User: Site systems member - manages data, approves audits
  super_user: [
    'view_assigned_sites',
    'manage_assets',
    'view_audit_log',
    'start_scan_session',
    'submit_audit',
    'upload_audit',
    'view_reports',
    'approve_action_items',
    'update_action_items',
    'upload_it_allocation',
    'upload_pbi_import',
    'send_reports',
    'approve_audits',
    'manage_site_data',
  ],

  // Auditor: Scans assets, reviews variances
  auditor: [
    'view_assigned_sites',
    'start_scan_session',
    'submit_audit',
    'upload_audit',
    'view_reports',
    'update_action_items',
  ],

  // Deprecated roles - map to equivalent permissions
  site_manager: [
    'view_assigned_sites',
    'manage_assets',
    'view_audit_log',
    'start_scan_session',
    'submit_audit',
    'upload_audit',
    'view_reports',
    'approve_action_items',
    'update_action_items',
    'upload_it_allocation',
    'upload_pbi_import',
    'send_reports',
    'approve_audits',
    'manage_site_data',
  ],

  site_operations: [
    'view_assigned_sites',
    'start_scan_session',
    'submit_audit',
    'upload_audit',
    'view_reports',
    'update_action_items',
  ],

  regional_director: [
    'view_assigned_sites',
    'view_reports',
    'approve_action_items',
  ],
}

// Helper to normalize roles (map deprecated to new)
export function normalizeRole(role: UserRole): 'admin' | 'super_user' | 'auditor' {
  switch (role) {
    case 'admin':
      return 'admin'
    case 'super_user':
    case 'site_manager':
    case 'regional_director':
      return 'super_user'
    case 'auditor':
    case 'site_operations':
    default:
      return 'auditor'
  }
}

// Get display name for role
export function getRoleDisplayName(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Administrator'
    case 'super_user':
    case 'site_manager':
      return 'Super User'
    case 'auditor':
    case 'site_operations':
      return 'Auditor'
    case 'regional_director':
      return 'Regional Director'
    default:
      return role
  }
}
