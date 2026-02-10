import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { klsDashboardApi, sitesApi, reportsApi } from '../services/api'
import type { KLSDashboardKPIs, AssetInventoryByType } from '../types'
import {
  Package,
  FileSpreadsheet,
  Wifi,
  WifiOff,
  AlertTriangle,
  Calendar,
  Mail,
  Download,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
} from 'lucide-react'

export default function DashboardPage() {
  const [selectedSite, setSelectedSite] = useState<string>('')

  // Fetch sites for selector
  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  // Fetch KLS summary for selected site
  const { data: klsSummary, isLoading: klsLoading } = useQuery({
    queryKey: ['kls-summary', selectedSite],
    queryFn: () => klsDashboardApi.getSiteSummary(selectedSite),
    enabled: !!selectedSite,
  })

  // Fetch portfolio summary when no site selected
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['kls-portfolio'],
    queryFn: () => klsDashboardApi.getPortfolioSummary(),
    enabled: !selectedSite,
  })

  const handleGenerateReport = async () => {
    if (!selectedSite) return
    try {
      const result = await reportsApi.generate(selectedSite)
      alert(`Report generated: ${result.message}`)
    } catch (error) {
      alert('Failed to generate report')
    }
  }

  const handleSendReport = async () => {
    if (!selectedSite) return
    try {
      const result = await reportsApi.send(selectedSite)
      alert(result.message)
    } catch (error) {
      alert('Failed to send report')
    }
  }

  const isLoading = selectedSite ? klsLoading : portfolioLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Site Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Audit Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monthly audit KPIs and variance tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Site Selector */}
          <div className="relative">
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-dhl-yellow"
            >
              <option value="">All Sites (Portfolio)</option>
              {sites?.map((site) => (
                <option key={site.site_code} value={site.site_code}>
                  {site.site_code} - {site.site_name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Action Buttons */}
          {selectedSite && (
            <>
              <button
                onClick={handleGenerateReport}
                className="flex items-center gap-2 px-4 py-2 bg-dhl-yellow text-gray-900 rounded-lg text-sm font-medium hover:bg-yellow-400 transition-colors"
              >
                <Download className="w-4 h-4" />
                Generate Report
              </button>
              <button
                onClick={handleSendReport}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Send Report
              </button>
            </>
          )}
        </div>
      </div>

      {/* Site-specific view */}
      {selectedSite && klsSummary ? (
        <SiteKLSDashboard summary={klsSummary} />
      ) : portfolio ? (
        <PortfolioKLSDashboard portfolio={portfolio} onSelectSite={setSelectedSite} />
      ) : null}
    </div>
  )
}

// Site-specific KLS Dashboard
function SiteKLSDashboard({ summary }: { summary: KLSDashboardKPIs }) {
  return (
    <div className="space-y-6">
      {/* Site Info Banner */}
      <div className="bg-dhl-yellow/10 border border-dhl-yellow rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {summary.site_name} ({summary.site_code})
            </h2>
            <p className="text-sm text-gray-600">
              Audit Date: {summary.audit_date || 'No audit yet'} •
              Auditor: {summary.auditor || 'N/A'} •
              Period: {summary.audit_period || 'N/A'}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            Report Generated: {new Date(summary.report_generated).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: On-Site Total */}
        <KPICard
          title="On-Site Total"
          value={summary.on_site_total}
          icon={<Package className="w-6 h-6" />}
          color="blue"
          subtitle={`Good: ${summary.good_count} | Bad: ${summary.bad_count} | RMA: ${summary.rma_count}`}
        />

        {/* KPI 2: IT Allocation Variance */}
        <KPICard
          title="IT Allocation Variance"
          value={summary.it_allocation_variance}
          total={summary.it_allocation_total}
          icon={<FileSpreadsheet className="w-6 h-6" />}
          color={summary.it_allocation_variance === 0 ? 'green' : 'yellow'}
          isVariance
          comment={summary.it_allocation_variance_comment}
        />

        {/* KPI 3: PBI/SOTI Variance */}
        <KPICard
          title="PBI/SOTI Variance"
          value={summary.pbi_variance}
          total={summary.pbi_total}
          icon={<Wifi className="w-6 h-6" />}
          color={summary.pbi_variance === 0 ? 'green' : 'yellow'}
          isVariance
          comment={summary.pbi_variance_comment}
        />

        {/* KPI 4: Inactive Devices */}
        <KPICard
          title={`${summary.inactive_threshold_days}-Day Inactive`}
          value={summary.inactive_device_count}
          icon={<WifiOff className="w-6 h-6" />}
          color={summary.inactive_device_count === 0 ? 'green' : 'red'}
          subtitle="Devices not connected"
        />
      </div>

      {/* Asset Inventory by Type */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-dhl-yellow/20 border-b border-dhl-yellow">
          <h3 className="font-semibold text-gray-900">Asset Inventory by Type</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Prior</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Good</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Bad</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">RMA</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lost</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">PBI Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">PBI Diff</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Δ Change</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {summary.inventory_by_type.map((item) => (
                <InventoryRow key={item.device_type} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workflow Status */}
      <WorkflowStatusCard workflow={summary.workflow} />

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/scan-audit"
          className="card p-4 hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="p-2 bg-blue-100 rounded-lg">
            <Package className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Scan Audit</p>
            <p className="text-sm text-gray-500">Start a new scan session</p>
          </div>
        </Link>

        <Link
          to="/pbi-import"
          className="card p-4 hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="p-2 bg-green-100 rounded-lg">
            <Wifi className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">PBI/SOTI Import</p>
            <p className="text-sm text-gray-500">Upload connection status</p>
          </div>
        </Link>

        <Link
          to="/it-allocation"
          className="card p-4 hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="p-2 bg-yellow-100 rounded-lg">
            <FileSpreadsheet className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">IT Allocation</p>
            <p className="text-sm text-gray-500">Upload allocation data</p>
          </div>
        </Link>
      </div>
    </div>
  )
}

// Portfolio view when no site selected
function PortfolioKLSDashboard({
  portfolio,
  onSelectSite
}: {
  portfolio: { totals: { on_site_total: number; it_allocation_total: number; pbi_total: number; inactive_count: number; sites_count: number }; it_allocation_variance: number; pbi_variance: number; sites: KLSDashboardKPIs[] }
  onSelectSite: (code: string) => void
}) {
  return (
    <div className="space-y-6">
      {/* Portfolio Totals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total On-Site"
          value={portfolio.totals.on_site_total}
          icon={<Package className="w-6 h-6" />}
          color="blue"
          subtitle={`Across ${portfolio.totals.sites_count} sites`}
        />
        <KPICard
          title="IT Allocation Variance"
          value={portfolio.it_allocation_variance}
          total={portfolio.totals.it_allocation_total}
          icon={<FileSpreadsheet className="w-6 h-6" />}
          color={portfolio.it_allocation_variance === 0 ? 'green' : 'yellow'}
          isVariance
        />
        <KPICard
          title="PBI/SOTI Variance"
          value={portfolio.pbi_variance}
          total={portfolio.totals.pbi_total}
          icon={<Wifi className="w-6 h-6" />}
          color={portfolio.pbi_variance === 0 ? 'green' : 'yellow'}
          isVariance
        />
        <KPICard
          title="Inactive Devices"
          value={portfolio.totals.inactive_count}
          icon={<WifiOff className="w-6 h-6" />}
          color={portfolio.totals.inactive_count === 0 ? 'green' : 'red'}
        />
      </div>

      {/* Sites Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Site Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">On-Site</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">IT Alloc</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">IT Var</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">PBI</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">PBI Var</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Inactive</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Audit</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {portfolio.sites.map((site) => (
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
                  <td className="px-4 py-3 text-right text-gray-600">{site.it_allocation_total}</td>
                  <td className="px-4 py-3 text-right">
                    <VarianceBadge value={site.it_allocation_variance} />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{site.pbi_total}</td>
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
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {site.audit_date || 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// KPI Card Component
function KPICard({
  title,
  value,
  total,
  icon,
  color,
  isVariance,
  subtitle,
  comment,
}: {
  title: string
  value: number
  total?: number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'yellow' | 'red'
  isVariance?: boolean
  subtitle?: string
  comment?: string | null
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        {isVariance && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-sm font-medium text-gray-700">{total}</p>
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-sm text-gray-500">{title}</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold text-gray-900">
            {isVariance && value > 0 && '+'}
            {value}
          </p>
          {isVariance && value !== 0 && (
            value > 0 ? (
              <ArrowUpRight className="w-5 h-5 text-yellow-500" />
            ) : (
              <ArrowDownRight className="w-5 h-5 text-yellow-500" />
            )
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        )}
        {comment && (
          <p className="text-xs text-gray-600 mt-2 italic">{comment}</p>
        )}
      </div>
    </div>
  )
}

// Inventory Row Component
function InventoryRow({ item }: { item: AssetInventoryByType }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2 font-medium text-gray-900">{item.device_type}</td>
      <td className="px-4 py-2 text-right text-gray-600">{item.prior_count || '-'}</td>
      <td className="px-4 py-2 text-right text-green-600">{item.good || '-'}</td>
      <td className="px-4 py-2 text-right text-red-600">{item.bad || '-'}</td>
      <td className="px-4 py-2 text-right text-yellow-600">{item.rma || '-'}</td>
      <td className="px-4 py-2 text-right text-gray-600">{item.lost || '-'}</td>
      <td className="px-4 py-2 text-right text-gray-600">{item.pbi_total || '-'}</td>
      <td className="px-4 py-2 text-right">
        <VarianceBadge value={item.pbi_report_diff} />
      </td>
      <td className="px-4 py-2 text-right font-medium">{item.current_count}</td>
      <td className="px-4 py-2 text-right">
        <VarianceBadge value={item.change} />
      </td>
    </tr>
  )
}

// Variance Badge Component
function VarianceBadge({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-gray-400">0</span>
  }
  const isPositive = value > 0
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      isPositive ? 'bg-yellow-100 text-yellow-800' : 'bg-yellow-100 text-yellow-800'
    }`}>
      {isPositive && '+'}{value}
    </span>
  )
}

// Workflow Status Component
function WorkflowStatusCard({ workflow }: { workflow: { audit_due_date: string; internal_review_due: string; report_deadline: string; audit_completed: boolean; review_completed: boolean; report_sent: boolean; days_until_due: number } }) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Calendar className="w-5 h-5" />
        Monthly Workflow Status
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${workflow.audit_completed ? 'bg-green-100' : 'bg-gray-100'}`}>
            {workflow.audit_completed ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Clock className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Audit</p>
            <p className="text-xs text-gray-500">
              {workflow.audit_completed ? 'Completed' : 'Pending'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${workflow.review_completed ? 'bg-green-100' : 'bg-gray-100'}`}>
            {workflow.review_completed ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Clock className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Internal Review</p>
            <p className="text-xs text-gray-500">Due: {workflow.internal_review_due}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${workflow.report_sent ? 'bg-green-100' : 'bg-gray-100'}`}>
            {workflow.report_sent ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Clock className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Report Delivery</p>
            <p className="text-xs text-gray-500">Due: {workflow.report_deadline}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${
            workflow.days_until_due <= 0 ? 'bg-red-100' :
            workflow.days_until_due <= 3 ? 'bg-yellow-100' : 'bg-blue-100'
          }`}>
            <AlertTriangle className={`w-5 h-5 ${
              workflow.days_until_due <= 0 ? 'text-red-600' :
              workflow.days_until_due <= 3 ? 'text-yellow-600' : 'text-blue-600'
            }`} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Days Until Due</p>
            <p className={`text-lg font-bold ${
              workflow.days_until_due <= 0 ? 'text-red-600' :
              workflow.days_until_due <= 3 ? 'text-yellow-600' : 'text-blue-600'
            }`}>
              {workflow.days_until_due}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
