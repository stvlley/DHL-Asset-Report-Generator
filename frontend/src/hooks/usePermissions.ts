/**
 * Hook for checking user permissions and role-based access.
 */
import { useAuthStore } from './useAuthStore'
import { ROLE_PERMISSIONS, normalizeRole, getRoleDisplayName, type Permission } from '../config/permissions'
import { getNavigationForRole, getDefaultRouteForRole, canAccessRoute } from '../config/navigation'

export function usePermissions() {
  const { user } = useAuthStore()

  const role = user?.role ?? 'auditor'
  const normalizedRole = normalizeRole(role)

  /**
   * Check if user has a specific permission.
   */
  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false
    const permissions = ROLE_PERMISSIONS[user.role] ?? []
    return permissions.includes(permission)
  }

  /**
   * Check if user can access a specific site.
   */
  const canAccessSite = (siteCode: string): boolean => {
    if (!user) return false

    // Admin can access all sites
    if (normalizedRole === 'admin') {
      return true
    }

    // Other roles can only access assigned sites
    return (user.assigned_sites ?? []).includes(siteCode)
  }

  /**
   * Check if user can access a specific route.
   */
  const checkRouteAccess = (route: string): boolean => {
    if (!user) return false
    return canAccessRoute(user.role, route)
  }

  /**
   * Get the user's navigation items.
   */
  const getNavigation = () => {
    return getNavigationForRole(role)
  }

  /**
   * Get the default landing page for the user.
   */
  const getDefaultRoute = () => {
    return getDefaultRouteForRole(role)
  }

  /**
   * Get human-readable role name.
   */
  const getRoleName = () => {
    return getRoleDisplayName(role)
  }

  /**
   * Check if current user is admin.
   */
  const isAdmin = normalizedRole === 'admin'

  /**
   * Check if current user is super user.
   */
  const isSuperUser = normalizedRole === 'super_user'

  /**
   * Check if current user is auditor.
   */
  const isAuditor = normalizedRole === 'auditor'

  /**
   * Check if user can approve audits.
   */
  const canApproveAudits = hasPermission('approve_audits')

  /**
   * Check if user can manage settings.
   */
  const canManageSettings = hasPermission('manage_settings')

  /**
   * Check if user can manage users.
   */
  const canManageUsers = hasPermission('manage_users')

  /**
   * Check if user can import data (IT Allocation, PBI).
   */
  const canImportData = hasPermission('upload_it_allocation') || hasPermission('upload_pbi_import')

  /**
   * Check if user can send reports.
   */
  const canSendReports = hasPermission('send_reports')

  return {
    // Role info
    role,
    normalizedRole,
    getRoleName,
    isAdmin,
    isSuperUser,
    isAuditor,

    // Permission checks
    hasPermission,
    canAccessSite,
    checkRouteAccess,
    canApproveAudits,
    canManageSettings,
    canManageUsers,
    canImportData,
    canSendReports,

    // Navigation
    getNavigation,
    getDefaultRoute,

    // User data
    user,
    assignedSites: user?.assigned_sites ?? [],
  }
}

export type { Permission }
