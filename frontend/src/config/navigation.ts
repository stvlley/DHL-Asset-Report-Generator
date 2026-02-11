/**
 * Role-based navigation configuration.
 * Each role sees a different set of navigation items.
 */
import {
  LayoutDashboard,
  Scan,
  Upload,
  FileText,
  Database,
  Building2,
  DollarSign,
  Smartphone,
  Users,
  Settings,
  ClipboardList,
  AlertTriangle,
  Briefcase,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '../types'
import { normalizeRole } from './permissions'

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  badge?: number // For pending items count
}

export interface NavSection {
  name: string
  icon: LucideIcon
  items: NavItem[]
}

export type NavigationItem = NavItem | NavSection

export function isNavSection(item: NavigationItem): item is NavSection {
  return 'items' in item
}

// Auditor navigation - Linear wizard flow
const auditorNav: NavItem[] = [
  { name: 'My Audits', href: '/my-audits', icon: ClipboardList },
  { name: 'Variances', href: '/variances', icon: AlertTriangle },
]

// Super User navigation - Dashboard-centric
const superUserNav: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Scan Audit', href: '/scan-audit', icon: Scan },
  { name: 'Audits', href: '/audits', icon: FileText },
  { name: 'IT Allocation', href: '/it-allocation', icon: DollarSign },
  { name: 'PBI/SOTI Import', href: '/pbi-import', icon: Smartphone },
  { name: 'Site Data', href: '/master-data', icon: Database },
]

// Admin navigation - Full access with Management section
const adminNav: NavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Scan Audit', href: '/scan-audit', icon: Scan },
  { name: 'Upload Audit', href: '/upload', icon: Upload },
  { name: 'Audits', href: '/audits', icon: FileText },
  {
    name: 'Management',
    icon: Briefcase,
    items: [
      { name: 'Master Data', href: '/master-data', icon: Database },
      { name: 'Sites', href: '/sites', icon: Building2 },
      { name: 'IT Allocation', href: '/it-allocation', icon: DollarSign },
      { name: 'PBI/SOTI Import', href: '/pbi-import', icon: Smartphone },
      { name: 'Users', href: '/users', icon: Users },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
]

/**
 * Get navigation items for a user's role.
 */
export function getNavigationForRole(role: UserRole): NavigationItem[] {
  const normalizedRole = normalizeRole(role)

  switch (normalizedRole) {
    case 'admin':
      return adminNav
    case 'super_user':
      return superUserNav
    case 'auditor':
      return auditorNav
    default:
      return auditorNav
  }
}

/**
 * Get the default landing page for a role after login.
 */
export function getDefaultRouteForRole(role: UserRole): string {
  const normalizedRole = normalizeRole(role)

  switch (normalizedRole) {
    case 'admin':
    case 'super_user':
      return '/dashboard'
    case 'auditor':
      return '/my-audits'
    default:
      return '/my-audits'
  }
}

/**
 * Check if a role can access a specific route.
 */
export function canAccessRoute(role: UserRole, route: string): boolean {
  const nav = getNavigationForRole(role)

  // Admin can access everything
  if (normalizeRole(role) === 'admin') {
    return true
  }

  // Check if route is in the role's navigation (including nested items)
  return nav.some(item => {
    if (isNavSection(item)) {
      return item.items.some(subItem => route.startsWith(subItem.href))
    }
    return route.startsWith(item.href)
  })
}

/**
 * Routes that require specific roles.
 */
export const PROTECTED_ROUTES: Record<string, ('admin' | 'super_user' | 'auditor')[]> = {
  '/users': ['admin'],
  '/settings': ['admin'],
  '/sites': ['admin'],
  '/upload': ['admin', 'super_user'],
  '/dashboard': ['admin', 'super_user'],
  '/it-allocation': ['admin', 'super_user'],
  '/pbi-import': ['admin', 'super_user'],
  '/master-data': ['admin', 'super_user'],
  '/scan-audit': ['admin', 'super_user', 'auditor'],
  '/audits': ['admin', 'super_user'],
  '/my-audits': ['admin', 'super_user', 'auditor'],
  '/variances': ['admin', 'super_user', 'auditor'],
}
