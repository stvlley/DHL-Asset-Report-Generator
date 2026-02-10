import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePermissions } from '../hooks/usePermissions'
import { sitesApi } from '../services/api'
import type { Variance, VarianceType, PriorityLevel } from '../types'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  Search,
  Filter,
} from 'lucide-react'

const VARIANCE_TYPE_LABELS: Record<VarianceType, string> = {
  CORRECT: 'Correct',
  MISALLOCATED: 'Misallocated',
  UNTRACKED: 'Untracked',
  MISSING: 'Missing',
  CONDITION_MISMATCH: 'Condition Mismatch',
  MDM_NOT_ENROLLED: 'MDM Not Enrolled',
  MDM_INACTIVE_WARNING: 'MDM Inactive',
  DUPLICATE_IN_AUDIT: 'Duplicate',
  GL_MISMATCH: 'GL Mismatch',
  NOT_IN_ALLOCATION: 'Not in Allocation',
}

const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-blue-100 text-blue-800',
  INFO: 'bg-gray-100 text-gray-800',
}

const STATUS_ICONS = {
  pending: Clock,
  in_progress: AlertTriangle,
  completed: CheckCircle2,
  cancelled: XCircle,
}

export default function VariancesPage() {
  const { assignedSites, isAdmin, isSuperUser } = usePermissions()

  const [selectedSite, setSelectedSite] = useState<string>('')
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch sites
  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  // Filter sites based on user's assignments
  const availableSites = (sites || []).filter((site) => {
    if (isAdmin || isSuperUser) return true
    return assignedSites.includes(site.site_code)
  })

  // Fetch variances - would need a new endpoint for cross-audit variances
  // For now, show placeholder
  const variances: Variance[] = []

  // Filter variances
  const filteredVariances = variances.filter(v => {
    if (selectedSite && v.physical_site !== selectedSite) return false
    if (selectedType && v.variance_type !== selectedType) return false
    if (selectedStatus && v.status !== selectedStatus) return false
    if (searchQuery && !v.serial_number?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Variances</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review and resolve discrepancies from your audits
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Site Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site
            </label>
            <div className="relative">
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red pr-10"
              >
                <option value="">All Sites</option>
                {availableSites.map((site) => (
                  <option key={site.site_code} value={site.site_code}>
                    {site.site_code} - {site.site_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <div className="relative">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red pr-10"
              >
                <option value="">All Types</option>
                {Object.entries(VARIANCE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red pr-10"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Serial number..."
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Variances List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredVariances.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="h-12 w-12 text-gray-300 mx-auto" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No Variances Found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {variances.length === 0
                ? 'Complete an audit to see variances here.'
                : 'Try adjusting your filters.'}
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Serial Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Site
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVariances.map((variance) => {
                const StatusIcon = STATUS_ICONS[variance.status as keyof typeof STATUS_ICONS] || Clock
                return (
                  <tr key={variance.variance_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {variance.serial_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {VARIANCE_TYPE_LABELS[variance.variance_type]}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          PRIORITY_COLORS[variance.priority]
                        }`}
                      >
                        {variance.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {variance.physical_site || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-500 capitalize">
                          {variance.status.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-dhl-red hover:text-red-700 font-medium">
                        Resolve
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
