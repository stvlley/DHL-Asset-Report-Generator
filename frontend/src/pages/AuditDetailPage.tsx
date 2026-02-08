import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { auditsApi, variancesApi } from '../services/api'
import { format } from 'date-fns'
import type { Variance } from '../types'
import {
  ArrowLeft,
  Download,
  CheckCircle,
  Minus,
  Plus,
  ArrowRight,
  Wrench,
  Copy,
  Search,
  Check,
  Clock,
  XCircle,
  AlertTriangle,
  DollarSign,
  Mail,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

type TabType = 'summary' | 'variances' | 'actions'
type VarianceFilter = 'all' | 'MISSING' | 'MISALLOCATED' | 'UNTRACKED' | 'CONDITION_MISMATCH' | 'GL_MISMATCH'
type StatusFilter = 'all' | 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED'

export default function AuditDetailPage() {
  const { auditId } = useParams<{ auditId: string }>()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('summary')
  const [varianceFilter, setVarianceFilter] = useState<VarianceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [_selectedVariance, setSelectedVariance] = useState<Variance | null>(null)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const { data: audit, isLoading: auditLoading, isFetching: auditFetching } = useQuery({
    queryKey: ['audit', auditId],
    queryFn: () => auditsApi.get(auditId!),
    enabled: !!auditId,
    retry: 3,
    retryDelay: 500,
  })

  const { data: summary, isLoading: summaryLoading, isFetching: summaryFetching } = useQuery({
    queryKey: ['audit-summary', auditId],
    queryFn: () => auditsApi.getExecutiveSummary(auditId!),
    enabled: !!auditId && !!audit,
    retry: 3,
    retryDelay: 500,
  })

  const { data: actionList } = useQuery({
    queryKey: ['audit-actions', auditId],
    queryFn: () => auditsApi.getActionList(auditId!),
    enabled: !!auditId,
  })

  const { data: variances, refetch: refetchVariances } = useQuery({
    queryKey: ['audit-variances', auditId],
    queryFn: () => variancesApi.list(auditId!),
    enabled: !!auditId,
  })

  const { data: varianceSummary } = useQuery({
    queryKey: ['variance-summary', auditId],
    queryFn: () => variancesApi.getSummary(auditId!),
    enabled: !!auditId,
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ varianceId, status, notes }: { varianceId: string; status: string; notes?: string }) =>
      variancesApi.updateStatus(varianceId, { status, resolution_notes: notes }),
    onSuccess: () => {
      refetchVariances()
      queryClient.invalidateQueries({ queryKey: ['variance-summary', auditId] })
      setSelectedVariance(null)
    },
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
  }

  // Filter variances
  const filteredVariances = variances?.filter((v) => {
    if (varianceFilter !== 'all' && v.variance_type !== varianceFilter) return false
    if (statusFilter !== 'all' && v.status !== statusFilter) return false
    if (searchTerm && !v.serial_number?.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800'
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800'
      case 'RESOLVED': return 'bg-green-100 text-green-800'
      case 'CANCELLED': return 'bg-gray-100 text-gray-600'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'text-red-600 bg-red-50'
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50'
      case 'LOW': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getVarianceTypeIcon = (type: string) => {
    switch (type) {
      case 'MISSING': return <Minus className="w-4 h-4 text-red-500" />
      case 'MISALLOCATED': return <ArrowRight className="w-4 h-4 text-yellow-500" />
      case 'UNTRACKED': return <Plus className="w-4 h-4 text-blue-500" />
      case 'CONDITION_MISMATCH': return <Wrench className="w-4 h-4 text-purple-500" />
      case 'GL_MISMATCH': return <DollarSign className="w-4 h-4 text-orange-500" />
      case 'CORRECT': return <CheckCircle className="w-4 h-4 text-green-500" />
      default: return <AlertTriangle className="w-4 h-4 text-gray-500" />
    }
  }

  // Show loading while data is being fetched
  if (auditLoading || summaryLoading || auditFetching || (!audit && auditId)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red" />
      </div>
    )
  }

  if (!audit) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Audit not found</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-dhl-red hover:underline"
        >
          Refresh page
        </button>
      </div>
    )
  }

  // Show loading for summary after audit is loaded
  if (summaryFetching || !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Link to="/audits" className="mr-4 p-2 hover:bg-gray-100 rounded">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {summary.header.site_code} - {summary.header.site_name}
            </h1>
            <p className="text-sm text-gray-500">
              Audit Date: {format(new Date(summary.header.audit_date), 'MMMM d, yyyy')} |
              Auditor: {summary.header.auditor}
            </p>
          </div>
        </div>
        <a
          href={auditsApi.exportExcelUrl(auditId!)}
          className="btn-secondary"
          download
        >
          <Download className="w-4 h-4 mr-2" />
          Export Excel
        </a>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'summary', label: 'Summary' },
            { id: 'variances', label: `Variances (${variances?.length || 0})` },
            { id: 'actions', label: 'Action Items' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-dhl-red text-dhl-red'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <>
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-sm font-medium text-gray-500">Assets Found</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {summary.physical_results.total_found}
              </p>
              <div className="mt-2 text-xs text-gray-500">
                Good: {summary.physical_results.good} | Bad: {summary.physical_results.bad} |
                RMA: {summary.physical_results.rma} | Lost: {summary.physical_results.lost}
              </div>
            </div>

            <div className="card p-4">
              <p className="text-sm font-medium text-gray-500">GL Accuracy</p>
              <p
                className={`text-3xl font-bold mt-1 ${
                  summary.metrics.gl_accuracy_pct >= 90
                    ? 'text-green-600'
                    : summary.metrics.gl_accuracy_pct >= 80
                    ? 'text-yellow-600'
                    : 'text-red-600'
                }`}
              >
                {summary.metrics.gl_accuracy_pct}%
              </p>
              <div className="mt-2 text-xs text-gray-500">
                {summary.gl_reconciliation.correct} of {summary.gl_reconciliation.assets_in_gl} correct
              </div>
            </div>

            <div className="card p-4">
              <p className="text-sm font-medium text-gray-500">Potential Savings</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                ${summary.metrics.potential_monthly_savings.toLocaleString()}/mo
              </p>
              <div className="mt-2 text-xs text-gray-500">
                ${summary.metrics.potential_annual_savings.toLocaleString()}/year
              </div>
            </div>

            <div className="card p-4">
              <p className="text-sm font-medium text-gray-500">Action Items</p>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-lg font-bold text-red-600">
                  {summary.action_items.high_priority} High
                </span>
                <span className="text-lg font-bold text-yellow-600">
                  {summary.action_items.medium_priority} Med
                </span>
                <span className="text-lg font-bold text-gray-600">
                  {summary.action_items.low_priority} Low
                </span>
              </div>
            </div>
          </div>

          {/* GL Reconciliation Summary */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              GL Reconciliation Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <CheckCircle className="w-8 h-8 mx-auto text-green-500" />
                <p className="text-2xl font-bold text-green-700 mt-2">
                  {summary.gl_reconciliation.correct}
                </p>
                <p className="text-sm text-green-600">Correct</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <Minus className="w-8 h-8 mx-auto text-red-500" />
                <p className="text-2xl font-bold text-red-700 mt-2">
                  {summary.gl_reconciliation.missing}
                </p>
                <p className="text-sm text-red-600">Missing</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <ArrowRight className="w-8 h-8 mx-auto text-yellow-500" />
                <p className="text-2xl font-bold text-yellow-700 mt-2">
                  {summary.gl_reconciliation.misallocated}
                </p>
                <p className="text-sm text-yellow-600">Misallocated</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Plus className="w-8 h-8 mx-auto text-blue-500" />
                <p className="text-2xl font-bold text-blue-700 mt-2">
                  {summary.gl_reconciliation.untracked}
                </p>
                <p className="text-sm text-blue-600">Untracked</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Wrench className="w-8 h-8 mx-auto text-purple-500" />
                <p className="text-2xl font-bold text-purple-700 mt-2">
                  {summary.gl_reconciliation.condition_mismatch}
                </p>
                <p className="text-sm text-purple-600">Condition</p>
              </div>
            </div>
          </div>

          {/* Variance Summary by Status */}
          {varianceSummary && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Resolution Status</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-yellow-50 rounded-lg text-center">
                  <Clock className="w-6 h-6 mx-auto text-yellow-600" />
                  <p className="text-2xl font-bold text-yellow-700 mt-2">
                    {variances?.filter(v => v.status === 'PENDING').length || 0}
                  </p>
                  <p className="text-sm text-yellow-600">Pending</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <Clock className="w-6 h-6 mx-auto text-blue-600" />
                  <p className="text-2xl font-bold text-blue-700 mt-2">
                    {variances?.filter(v => v.status === 'IN_PROGRESS').length || 0}
                  </p>
                  <p className="text-sm text-blue-600">In Progress</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <Check className="w-6 h-6 mx-auto text-green-600" />
                  <p className="text-2xl font-bold text-green-700 mt-2">
                    {variances?.filter(v => v.status === 'RESOLVED').length || 0}
                  </p>
                  <p className="text-sm text-green-600">Resolved</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <XCircle className="w-6 h-6 mx-auto text-gray-600" />
                  <p className="text-2xl font-bold text-gray-700 mt-2">
                    {variances?.filter(v => v.status === 'CANCELLED').length || 0}
                  </p>
                  <p className="text-sm text-gray-600">Cancelled</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Variances Tab */}
      {activeTab === 'variances' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by serial number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input pl-10"
                  />
                </div>
              </div>
              <div className="w-48">
                <select
                  value={varianceFilter}
                  onChange={(e) => setVarianceFilter(e.target.value as VarianceFilter)}
                  className="input"
                >
                  <option value="all">All Types</option>
                  <option value="MISSING">Missing</option>
                  <option value="MISALLOCATED">Misallocated</option>
                  <option value="UNTRACKED">Untracked</option>
                  <option value="CONDITION_MISMATCH">Condition Mismatch</option>
                  <option value="GL_MISMATCH">GL Mismatch</option>
                </select>
              </div>
              <div className="w-48">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="input"
                >
                  <option value="all">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Variance List */}
          <div className="card overflow-hidden">
            <div className="divide-y divide-gray-100">
              {filteredVariances && filteredVariances.length > 0 ? (
                filteredVariances.map((variance) => (
                  <div key={variance.variance_id} className="bg-white">
                    <div
                      className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(variance.variance_id)}
                    >
                      <div className="flex items-center gap-4">
                        {getVarianceTypeIcon(variance.variance_type)}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {variance.serial_number}
                          </p>
                          <p className="text-xs text-gray-500">
                            {variance.asset_type} | {variance.variance_type.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getPriorityColor(variance.priority)}`}>
                          {variance.priority}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(variance.status)}`}>
                          {variance.status.replace('_', ' ')}
                        </span>
                        {variance.monthly_cost_impact > 0 && (
                          <span className="text-sm font-medium text-green-600">
                            ${variance.monthly_cost_impact}/mo
                          </span>
                        )}
                        {expandedItems.has(variance.variance_id) ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedItems.has(variance.variance_id) && (
                      <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Description</p>
                            <p className="font-medium">{variance.description}</p>
                          </div>
                          {variance.recommended_action && (
                            <div>
                              <p className="text-gray-500">Recommended Action</p>
                              <p className="font-medium">{variance.recommended_action}</p>
                            </div>
                          )}
                          {variance.gl_string && (
                            <div>
                              <p className="text-gray-500">Current GL</p>
                              <p className="font-mono text-xs">{variance.gl_string}</p>
                            </div>
                          )}
                          {variance.expected_site_code && (
                            <div>
                              <p className="text-gray-500">Expected Site</p>
                              <p className="font-medium">{variance.expected_site_code}</p>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="mt-4 flex gap-2">
                          {variance.status === 'PENDING' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  updateStatusMutation.mutate({
                                    varianceId: variance.variance_id,
                                    status: 'IN_PROGRESS',
                                  })
                                }}
                                className="btn-primary text-xs py-1"
                              >
                                <Clock className="w-3 h-3 mr-1" />
                                Start
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  updateStatusMutation.mutate({
                                    varianceId: variance.variance_id,
                                    status: 'CANCELLED',
                                  })
                                }}
                                className="btn-outline text-xs py-1"
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                Cancel
                              </button>
                            </>
                          )}
                          {variance.status === 'IN_PROGRESS' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                updateStatusMutation.mutate({
                                  varianceId: variance.variance_id,
                                  status: 'RESOLVED',
                                })
                              }}
                              className="btn-primary text-xs py-1"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Resolve
                            </button>
                          )}
                          {variance.email_template && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                copyToClipboard(variance.email_template!)
                              }}
                              className="btn-outline text-xs py-1"
                            >
                              <Mail className="w-3 h-3 mr-1" />
                              Copy Email
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-gray-500">
                  No variances found matching your filters
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions Tab */}
      {activeTab === 'actions' && actionList && (
        <div className="space-y-4">
          {/* Removal Items */}
          {actionList.removal.count > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-red-800">
                      {actionList.removal.title}
                    </h3>
                    <p className="text-sm text-red-600">{actionList.removal.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-700">
                      ${actionList.removal.total_monthly_savings?.toLocaleString()}/mo
                    </p>
                    <p className="text-xs text-red-600">{actionList.removal.count} items</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {actionList.removal.items.map((item) => (
                  <div
                    key={item.variance_id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.serial_number}</p>
                      <p className="text-xs text-gray-500">
                        {item.asset_type} - {item.model} | ${item.monthly_cost_impact}/month
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {item.email_template && (
                        <button
                          onClick={() => copyToClipboard(item.email_template!)}
                          className="btn-outline text-xs py-1"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy Email
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transfer Items */}
          {actionList.transfer.count > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-yellow-800">
                      {actionList.transfer.title}
                    </h3>
                    <p className="text-sm text-yellow-600">{actionList.transfer.description}</p>
                  </div>
                  <p className="text-xs text-yellow-600">{actionList.transfer.count} items</p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {actionList.transfer.items.map((item) => (
                  <div
                    key={item.variance_id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.serial_number}</p>
                      <p className="text-xs text-gray-500">
                        {item.asset_type} - {item.model} |
                        <span className="text-yellow-600"> From: {item.current_gl_site}</span> →
                        <span className="text-green-600"> To: {item.physical_site}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {item.email_template && (
                        <button
                          onClick={() => copyToClipboard(item.email_template!)}
                          className="btn-outline text-xs py-1"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy Email
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Addition Items */}
          {actionList.addition.count > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-blue-800">
                      {actionList.addition.title}
                    </h3>
                    <p className="text-sm text-blue-600">{actionList.addition.description}</p>
                  </div>
                  <p className="text-xs text-blue-600">{actionList.addition.count} items</p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {actionList.addition.items.map((item) => (
                  <div
                    key={item.variance_id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.serial_number}</p>
                      <p className="text-xs text-gray-500">
                        {item.asset_type} - {item.model} | Condition: {item.physical_condition}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {item.email_template && (
                        <button
                          onClick={() => copyToClipboard(item.email_template!)}
                          className="btn-outline text-xs py-1"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy Email
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Condition Items */}
          {actionList.condition.count > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-purple-800">
                      {actionList.condition.title}
                    </h3>
                    <p className="text-sm text-purple-600">{actionList.condition.description}</p>
                  </div>
                  <p className="text-xs text-purple-600">{actionList.condition.count} items</p>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {actionList.condition.items.map((item) => (
                  <div
                    key={item.variance_id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.serial_number}</p>
                      <p className="text-xs text-gray-500">
                        {item.asset_type} - {item.model} |
                        <span className="text-red-600"> Reported: {item.physical_condition}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {item.email_template && (
                        <button
                          onClick={() => copyToClipboard(item.email_template!)}
                          className="btn-outline text-xs py-1"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy Email
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Actions */}
          {actionList.removal.count === 0 &&
            actionList.transfer.count === 0 &&
            actionList.addition.count === 0 &&
            actionList.condition.count === 0 && (
              <div className="card p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
                <p className="mt-4 text-lg font-medium text-gray-900">No Action Items</p>
                <p className="text-sm text-gray-500">All assets are properly reconciled</p>
              </div>
            )}
        </div>
      )}
    </div>
  )
}
