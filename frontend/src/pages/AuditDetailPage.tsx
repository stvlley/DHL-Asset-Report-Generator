import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { auditsApi, sitesApi } from '../services/api'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Download,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Minus,
  Plus,
  ArrowRight,
  Wrench,
  Wifi,
  Copy,
} from 'lucide-react'

export default function AuditDetailPage() {
  const { auditId } = useParams<{ auditId: string }>()

  const { data: audit, isLoading: auditLoading } = useQuery({
    queryKey: ['audit', auditId],
    queryFn: () => auditsApi.get(auditId!),
    enabled: !!auditId,
  })

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['audit-summary', auditId],
    queryFn: () => auditsApi.getExecutiveSummary(auditId!),
    enabled: !!auditId,
  })

  const { data: actionList } = useQuery({
    queryKey: ['audit-actions', auditId],
    queryFn: () => auditsApi.getActionList(auditId!),
    enabled: !!auditId,
  })

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  const getSiteName = (siteCode: string) => {
    const site = sites?.find((s) => s.site_code === siteCode)
    return site?.site_name || siteCode
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (auditLoading || summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red" />
      </div>
    )
  }

  if (!audit || !summary) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Audit not found</p>
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

      {/* Action Items */}
      {actionList && (
        <div className="space-y-4">
          {/* Removal Items */}
          {actionList.removal.count > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                <h3 className="font-semibold text-red-800">
                  {actionList.removal.title}
                </h3>
                <p className="text-sm text-red-600">
                  {actionList.removal.description} |
                  Potential savings: ${actionList.removal.total_monthly_savings?.toLocaleString()}/month
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {actionList.removal.items.slice(0, 5).map((item) => (
                  <div
                    key={item.variance_id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.serial_number}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.asset_type} - {item.model} |
                        ${item.monthly_cost_impact}/month
                      </p>
                    </div>
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
                ))}
                {actionList.removal.count > 5 && (
                  <div className="px-4 py-2 text-center text-sm text-gray-500">
                    +{actionList.removal.count - 5} more items
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transfer Items */}
          {actionList.transfer.count > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100">
                <h3 className="font-semibold text-yellow-800">
                  {actionList.transfer.title}
                </h3>
                <p className="text-sm text-yellow-600">{actionList.transfer.description}</p>
              </div>
              <div className="divide-y divide-gray-100">
                {actionList.transfer.items.slice(0, 5).map((item) => (
                  <div
                    key={item.variance_id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.serial_number}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.asset_type} - {item.model} |
                        From: {item.current_gl_site} | To: {item.physical_site}
                      </p>
                    </div>
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
                ))}
              </div>
            </div>
          )}

          {/* Addition Items */}
          {actionList.addition.count > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                <h3 className="font-semibold text-blue-800">
                  {actionList.addition.title}
                </h3>
                <p className="text-sm text-blue-600">{actionList.addition.description}</p>
              </div>
              <div className="divide-y divide-gray-100">
                {actionList.addition.items.slice(0, 5).map((item) => (
                  <div
                    key={item.variance_id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.serial_number}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.asset_type} - {item.model} |
                        Condition: {item.physical_condition}
                      </p>
                    </div>
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
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
