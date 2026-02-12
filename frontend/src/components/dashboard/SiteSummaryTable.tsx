/**
 * Enhanced Site Summary Table with sorting and quick filters.
 */
import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react'
import type { KLSDashboardKPIs } from '../../types'

interface SiteSummaryTableProps {
  sites: KLSDashboardKPIs[]
  onSelectSite: (siteCode: string) => void
}

type SortField = 'site_code' | 'on_site_total' | 'it_allocation_variance' | 'pbi_variance' | 'inactive_device_count' | 'days_since_audit'
type SortDirection = 'asc' | 'desc'
type QuickFilter = 'all' | 'overdue' | 'high_priority' | 'high_variance'

export default function SiteSummaryTable({ sites, onSelectSite }: SiteSummaryTableProps) {
  const [sortField, setSortField] = useState<SortField>('site_code')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')

  // Compute days since audit for each site
  const sitesWithDays = useMemo(() =>
    sites.map(site => ({
      ...site,
      days_since_audit: site.audit_date
        ? Math.floor((Date.now() - new Date(site.audit_date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
    })),
    [sites]
  )

  // Apply quick filter
  const filteredSites = useMemo(() => {
    switch (quickFilter) {
      case 'overdue':
        return sitesWithDays.filter(s => s.days_since_audit === null || s.days_since_audit > 30)
      case 'high_priority':
        return sitesWithDays.filter(s => s.inactive_device_count > 0)
      case 'high_variance':
        return sitesWithDays.filter(s =>
          Math.abs(s.it_allocation_variance) > 5 || Math.abs(s.pbi_variance) > 5
        )
      default:
        return sitesWithDays
    }
  }, [sitesWithDays, quickFilter])

  // Sort sites
  const sortedSites = useMemo(() => {
    return [...filteredSites].sort((a, b) => {
      let aVal: number | string | null
      let bVal: number | string | null

      switch (sortField) {
        case 'site_code':
          aVal = a.site_code
          bVal = b.site_code
          break
        case 'on_site_total':
          aVal = a.on_site_total
          bVal = b.on_site_total
          break
        case 'it_allocation_variance':
          aVal = a.it_allocation_variance
          bVal = b.it_allocation_variance
          break
        case 'pbi_variance':
          aVal = a.pbi_variance
          bVal = b.pbi_variance
          break
        case 'inactive_device_count':
          aVal = a.inactive_device_count
          bVal = b.inactive_device_count
          break
        case 'days_since_audit':
          aVal = a.days_since_audit
          bVal = b.days_since_audit
          break
        default:
          return 0
      }

      // Handle null values
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return 1
      if (bVal === null) return -1

      // Compare
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }

      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })
  }, [filteredSites, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-gray-400" />
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 text-dhl-red" />
      : <ArrowDown className="w-3 h-3 text-dhl-red" />
  }

  const getStatusBadge = (daysSince: number | null) => {
    if (daysSince === null) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">Never</span>
    }
    if (daysSince > 30) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">Overdue</span>
    }
    if (daysSince > 20) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700">Due Soon</span>
    }
    return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">OK</span>
  }

  const quickFilters: { key: QuickFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All Sites', count: sitesWithDays.length },
    { key: 'overdue', label: 'Overdue', count: sitesWithDays.filter(s => s.days_since_audit === null || s.days_since_audit > 30).length },
    { key: 'high_variance', label: 'High Variance', count: sitesWithDays.filter(s => Math.abs(s.it_allocation_variance) > 5 || Math.abs(s.pbi_variance) > 5).length },
    { key: 'high_priority', label: 'Inactive Devices', count: sitesWithDays.filter(s => s.inactive_device_count > 0).length },
  ]

  return (
    <div className="card overflow-hidden">
      {/* Quick Filters */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          {quickFilters.map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                quickFilter === f.key
                  ? 'bg-dhl-yellow text-gray-900'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
              {f.count > 0 && f.key !== 'all' && (
                <span className="ml-1 opacity-70">({f.count})</span>
              )}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {sortedSites.length} sites
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('site_code')}
              >
                <div className="flex items-center gap-1">
                  Site
                  <SortIcon field="site_code" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('on_site_total')}
              >
                <div className="flex items-center justify-end gap-1">
                  Assets
                  <SortIcon field="on_site_total" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('it_allocation_variance')}
              >
                <div className="flex items-center justify-end gap-1">
                  IT Var
                  <SortIcon field="it_allocation_variance" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('pbi_variance')}
              >
                <div className="flex items-center justify-end gap-1">
                  PBI Var
                  <SortIcon field="pbi_variance" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('inactive_device_count')}
              >
                <div className="flex items-center justify-end gap-1">
                  Inactive
                  <SortIcon field="inactive_device_count" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('days_since_audit')}
              >
                <div className="flex items-center justify-end gap-1">
                  Days Since
                  <SortIcon field="days_since_audit" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedSites.map((site) => (
              <tr
                key={site.site_code}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelectSite(site.site_code)}
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{site.site_code}</p>
                    <p className="text-xs text-gray-500">{site.site_name}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium">{site.on_site_total}</td>
                <td className="px-4 py-3 text-right">
                  <VarianceBadge value={site.it_allocation_variance} />
                </td>
                <td className="px-4 py-3 text-right">
                  <VarianceBadge value={site.pbi_variance} />
                </td>
                <td className="px-4 py-3 text-right">
                  {site.inactive_device_count > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                      {site.inactive_device_count}
                    </span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-600">
                  {site.days_since_audit !== null ? `${site.days_since_audit}d` : '-'}
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(site.days_since_audit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedSites.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500">
            No sites match the selected filter
          </div>
        )}
      </div>
    </div>
  )
}

function VarianceBadge({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-gray-400">0</span>
  }
  const isHigh = Math.abs(value) > 5
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      isHigh ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
    }`}>
      {value > 0 && '+'}{value}
    </span>
  )
}
