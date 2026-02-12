/**
 * Alerts panel for dashboard - displays computed alerts based on data.
 * Supports dismissing alerts with localStorage persistence.
 */
import { useState, useEffect, useMemo } from 'react'
import { Bell, ChevronDown, ChevronUp } from 'lucide-react'
import AlertItem from './AlertItem'
import type { DashboardAlert } from '../../../types'

interface AlertsPanelProps {
  alerts: DashboardAlert[]
}

export default function AlertsPanel({ alerts }: AlertsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    const stored = localStorage.getItem('dashboard-dismissed-alerts')
    return stored ? JSON.parse(stored) : []
  })

  // Persist dismissed alerts
  useEffect(() => {
    localStorage.setItem('dashboard-dismissed-alerts', JSON.stringify(dismissedIds))
  }, [dismissedIds])

  // Filter out dismissed alerts
  const visibleAlerts = useMemo(() =>
    alerts.filter(a => !dismissedIds.includes(a.id)),
    [alerts, dismissedIds]
  )

  // Count by severity
  const criticalCount = visibleAlerts.filter(a => a.severity === 'critical').length
  const warningCount = visibleAlerts.filter(a => a.severity === 'warning').length

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => [...prev, id])
  }

  const handleClearDismissed = () => {
    setDismissedIds([])
  }

  if (visibleAlerts.length === 0) {
    return null
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gradient-to-r from-red-50 to-yellow-50 border-b border-gray-200 flex items-center justify-between hover:from-red-100 hover:to-yellow-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-5 h-5 text-gray-700" />
            {visibleAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {visibleAlerts.length}
              </span>
            )}
          </div>
          <span className="font-semibold text-gray-900">Alerts</span>
          <div className="flex items-center gap-2 text-xs">
            {criticalCount > 0 && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                {warningCount} warning
              </span>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-2">
          {visibleAlerts.map(alert => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onDismiss={handleDismiss}
            />
          ))}
          {dismissedIds.length > 0 && (
            <button
              onClick={handleClearDismissed}
              className="text-xs text-gray-500 hover:text-gray-700 mt-2"
            >
              Show {dismissedIds.length} dismissed alert{dismissedIds.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Helper function to compute alerts from dashboard data.
 * Call this in the parent component to generate alerts.
 */
export function computeAlerts(data: {
  sites?: Array<{
    site_code: string
    site_name: string
    days_since_audit?: number | null
    is_overdue?: boolean
    it_allocation_variance?: number
    pbi_variance?: number
    inactive_device_count?: number
  }>
  workflow?: {
    days_until_due: number
    audit_completed: boolean
    review_completed: boolean
    report_sent: boolean
  }
  selectedSite?: string
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = []

  // Overdue audits (portfolio level)
  data.sites?.forEach(site => {
    if (site.is_overdue || (site.days_since_audit && site.days_since_audit > 30)) {
      alerts.push({
        id: `overdue-${site.site_code}`,
        type: 'overdue_audit',
        severity: 'critical',
        title: `${site.site_code} audit overdue`,
        description: `${site.days_since_audit || 'Many'} days since last audit`,
        siteCode: site.site_code,
        actionUrl: `/scan-audit?site=${site.site_code}`,
      })
    }

    // High variance alerts
    const itVar = Math.abs(site.it_allocation_variance || 0)
    const pbiVar = Math.abs(site.pbi_variance || 0)
    if (itVar > 5 || pbiVar > 5) {
      alerts.push({
        id: `variance-${site.site_code}`,
        type: 'high_variance',
        severity: 'warning',
        title: `${site.site_code} has high variance`,
        description: `IT: ${site.it_allocation_variance || 0}, PBI: ${site.pbi_variance || 0}`,
        siteCode: site.site_code,
      })
    }

    // Inactive devices
    if ((site.inactive_device_count || 0) > 0) {
      alerts.push({
        id: `inactive-${site.site_code}`,
        type: 'inactive_devices',
        severity: 'info',
        title: `${site.site_code} has inactive devices`,
        description: `${site.inactive_device_count} devices not connected`,
        siteCode: site.site_code,
      })
    }
  })

  // Workflow deadline (site level)
  if (data.workflow && data.selectedSite) {
    const { days_until_due, report_sent } = data.workflow
    if (!report_sent && days_until_due <= 3) {
      alerts.push({
        id: `deadline-${data.selectedSite}`,
        type: 'workflow_deadline',
        severity: days_until_due <= 0 ? 'critical' : 'warning',
        title: days_until_due <= 0 ? 'Report deadline passed!' : 'Report deadline approaching',
        description: days_until_due <= 0
          ? 'Report is overdue'
          : `Due in ${days_until_due} day${days_until_due !== 1 ? 's' : ''}`,
      })
    }
  }

  // Sort by severity (critical first)
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
