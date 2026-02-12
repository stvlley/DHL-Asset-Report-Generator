/**
 * Asset Audit Dashboard with improved UX, charts, and actionable insights.
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { klsDashboardApi, sitesApi, auditsApi, assetManagementApi, dashboardApi } from '../services/api'
import type { KLSDashboardKPIs, AssetInventoryByType, Asset } from '../types'
import {
  KPICard,
  SectionCard,
  SiteSummaryTable,
  TrendLineChart,
  VarianceDonutChart,
  transformVarianceSummary,
  AlertsPanel,
  computeAlerts,
} from '../components/dashboard'
import {
  Package,
  FileSpreadsheet,
  Wifi,
  WifiOff,
  AlertTriangle,
  Calendar,
  Building2,
  FileText,
  Download,
  ChevronDown,
  ChevronLeft,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  TrendingUp,
  PieChart,
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

  // Fetch trends data
  const { data: trendsData } = useQuery({
    queryKey: ['dashboard-trends', selectedSite || 'all'],
    queryFn: () => dashboardApi.getTrends({ site_code: selectedSite || undefined, months: 6 }),
  })

  // Fetch legacy portfolio summary for overdue/high priority counts
  const { data: legacyPortfolio } = useQuery({
    queryKey: ['portfolio-summary'],
    queryFn: () => dashboardApi.getPortfolioSummary(),
  })

  // Fetch audits for count
  const { data: audits } = useQuery({
    queryKey: ['audits'],
    queryFn: () => auditsApi.list(),
  })

  // Fetch assets when site is selected
  const { data: assetsData } = useQuery({
    queryKey: ['assets', selectedSite],
    queryFn: () => assetManagementApi.list({ site_code: selectedSite, limit: 500 }),
    enabled: !!selectedSite,
  })

  const totalAudits = audits?.length ?? 0
  const siteAudits = selectedSite ? audits?.filter(a => a.site_code === selectedSite).length ?? 0 : totalAudits

  // Compute alerts
  const alerts = useMemo(() => {
    if (selectedSite && klsSummary) {
      return computeAlerts({
        workflow: klsSummary.workflow,
        selectedSite,
        sites: [{
          site_code: klsSummary.site_code,
          site_name: klsSummary.site_name,
          it_allocation_variance: klsSummary.it_allocation_variance,
          pbi_variance: klsSummary.pbi_variance,
          inactive_device_count: klsSummary.inactive_device_count,
        }],
      })
    }
    if (!selectedSite && portfolio?.sites) {
      return computeAlerts({
        sites: portfolio.sites.map(s => ({
          ...s,
          days_since_audit: s.audit_date
            ? Math.floor((Date.now() - new Date(s.audit_date).getTime()) / (1000 * 60 * 60 * 24))
            : null,
          is_overdue: s.audit_date
            ? Math.floor((Date.now() - new Date(s.audit_date).getTime()) / (1000 * 60 * 60 * 24)) > 30
            : true,
        })),
      })
    }
    return []
  }, [selectedSite, klsSummary, portfolio])

  // Compute variance chart data from latest audit summary
  const varianceChartData = useMemo(() => {
    if (selectedSite && klsSummary) {
      // Use GL reconciliation data if available
      return transformVarianceSummary({
        correct: klsSummary.on_site_total - (klsSummary.it_allocation_variance < 0 ? Math.abs(klsSummary.it_allocation_variance) : 0),
        missing: klsSummary.it_allocation_variance > 0 ? klsSummary.it_allocation_variance : 0,
        misallocated: 0,
        untracked: klsSummary.it_allocation_variance < 0 ? Math.abs(klsSummary.it_allocation_variance) : 0,
      })
    }
    return []
  }, [selectedSite, klsSummary])

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
        <div className="flex items-center gap-3">
          {selectedSite && (
            <button
              onClick={() => setSelectedSite('')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Back to Portfolio"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedSite ? `${klsSummary?.site_name || selectedSite}` : 'Asset Audit Dashboard'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {selectedSite
                ? `Site ${selectedSite} • ${siteAudits} audits completed`
                : 'Portfolio overview and variance tracking'
              }
            </p>
          </div>
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
        </div>
      </div>

      {/* Alerts Panel */}
      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      {/* Site-specific view */}
      {selectedSite && klsSummary ? (
        <SiteKLSDashboard
          summary={klsSummary}
          assets={assetsData?.items ?? []}
          auditCount={siteAudits}
          trends={trendsData?.trends ?? []}
          varianceData={varianceChartData}
        />
      ) : (
        <PortfolioKLSDashboard
          portfolio={portfolio}
          legacyPortfolio={legacyPortfolio}
          onSelectSite={setSelectedSite}
          totalAudits={totalAudits}
          trends={trendsData?.trends ?? []}
        />
      )}
    </div>
  )
}

// Site-specific KLS Dashboard
function SiteKLSDashboard({
  summary,
  assets,
  auditCount,
  trends,
  varianceData,
}: {
  summary: KLSDashboardKPIs
  assets: Asset[]
  auditCount: number
  trends: Array<{ month: string; gl_accuracy_pct: number | null; potential_savings: number; total_assets: number }>
  varianceData: Array<{ type: string; count: number }>
}) {
  const [assetSearch, setAssetSearch] = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState('')
  const [conditionFilter, setConditionFilter] = useState('')

  // Get unique asset types for filter
  const assetTypes = [...new Set(assets.map(a => a.asset_type).filter(Boolean))]

  // Filter assets
  const filteredAssets = assets.filter(asset => {
    const matchesSearch = !assetSearch ||
      asset.serial_number?.toLowerCase().includes(assetSearch.toLowerCase()) ||
      asset.model?.toLowerCase().includes(assetSearch.toLowerCase())
    const matchesType = !assetTypeFilter || asset.asset_type === assetTypeFilter
    const matchesCondition = !conditionFilter || asset.recorded_condition === conditionFilter
    return matchesSearch && matchesType && matchesCondition
  })

  const handleExportAssets = () => {
    const headers = ['Serial Number', 'Type', 'Model', 'Condition', 'GL String', 'Cost/Month']
    const rows = filteredAssets.map(a => [
      a.serial_number,
      a.asset_type,
      a.model,
      a.recorded_condition || '',
      a.gl_string,
      a.cost_per_month?.toFixed(2) || ''
    ])
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${summary.site_code}_assets.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
              Audits: {auditCount}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            Assets: {assets.length}
          </div>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="On-Site Total"
          value={summary.on_site_total}
          icon={<Package className="w-6 h-6" />}
          color="blue"
          subtitle={`Good: ${summary.good_count} | Bad: ${summary.bad_count} | RMA: ${summary.rma_count}`}
        />
        <KPICard
          title="IT Allocation Variance"
          value={summary.it_allocation_variance}
          total={summary.it_allocation_total}
          icon={<FileSpreadsheet className="w-6 h-6" />}
          color={summary.it_allocation_variance === 0 ? 'green' : 'yellow'}
          isVariance
          comment={summary.it_allocation_variance_comment}
        />
        <KPICard
          title="PBI/SOTI Variance"
          value={summary.pbi_variance}
          total={summary.pbi_total}
          icon={<Wifi className="w-6 h-6" />}
          color={summary.pbi_variance === 0 ? 'green' : 'yellow'}
          isVariance
          comment={summary.pbi_variance_comment}
        />
        <KPICard
          title={`${summary.inactive_threshold_days}-Day Inactive`}
          value={summary.inactive_device_count}
          icon={<WifiOff className="w-6 h-6" />}
          color={summary.inactive_device_count === 0 ? 'green' : 'red'}
          subtitle="Devices not connected"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-gray-500" />
              GL Accuracy Trend
            </h3>
          </div>
          <TrendLineChart data={trends} height={220} showSavings />
        </div>

        {/* Variance Chart */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-gray-500" />
              Variance Breakdown
            </h3>
          </div>
          <VarianceDonutChart data={varianceData} height={220} />
        </div>
      </div>

      {/* Asset Inventory by Type */}
      <SectionCard
        title="Asset Inventory by Type"
        icon={<Package className="w-5 h-5 text-gray-500" />}
        storageKey="inventory-table"
      >
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
      </SectionCard>

      {/* Asset Details Table */}
      <SectionCard
        title="Asset Details"
        icon={<FileText className="w-5 h-5 text-gray-500" />}
        storageKey="asset-details"
        action={
          <button
            onClick={handleExportAssets}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-dhl-yellow text-gray-900 rounded-md hover:bg-yellow-400"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        }
      >
        <div className="px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-dhl-yellow"
            />
          </div>
          <select
            value={assetTypeFilter}
            onChange={(e) => setAssetTypeFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-dhl-yellow"
          >
            <option value="">All Types</option>
            {assetTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-dhl-yellow"
          >
            <option value="">All Conditions</option>
            <option value="Good">Good</option>
            <option value="Bad">Bad</option>
            <option value="RMA">RMA</option>
            <option value="Lost">Lost</option>
          </select>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Serial</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">GL String</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost/Mo</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAssets.slice(0, 100).map((asset) => (
                <tr key={asset.asset_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm font-mono text-gray-900">{asset.serial_number}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{asset.asset_type}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{asset.model}</td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      asset.recorded_condition === 'Good' ? 'bg-green-100 text-green-800' :
                      asset.recorded_condition === 'Bad' ? 'bg-red-100 text-red-800' :
                      asset.recorded_condition === 'RMA' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {asset.recorded_condition || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500 font-mono text-xs">{asset.gl_string}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-600">
                    {asset.cost_per_month ? `$${asset.cost_per_month.toFixed(2)}` : '-'}
                  </td>
                </tr>
              ))}
              {filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <Filter className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No assets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredAssets.length > 100 && (
            <div className="px-4 py-2 bg-gray-50 text-sm text-gray-500 text-center border-t">
              Showing 100 of {filteredAssets.length} assets. Export for full list.
            </div>
          )}
        </div>
      </SectionCard>

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
  legacyPortfolio,
  onSelectSite,
  totalAudits,
  trends,
}: {
  portfolio?: { totals: { on_site_total: number; it_allocation_total: number; pbi_total: number; inactive_count: number; sites_count: number }; it_allocation_variance: number; pbi_variance: number; sites: KLSDashboardKPIs[] } | null
  legacyPortfolio?: { sites_with_overdue_audits: number; high_priority_items: number } | null
  onSelectSite: (code: string) => void
  totalAudits: number
  trends: Array<{ month: string; gl_accuracy_pct: number | null; potential_savings: number; total_assets: number }>
}) {
  // Default values when portfolio is not yet loaded
  const totals = portfolio?.totals ?? { on_site_total: 0, it_allocation_total: 0, pbi_total: 0, inactive_count: 0, sites_count: 0 }
  const sites = portfolio?.sites ?? []

  // Compute variance data from all sites
  const portfolioVarianceData = useMemo(() => {
    const varianceTotals = {
      correct: 0,
      missing: 0,
      misallocated: 0,
      untracked: 0,
    }
    sites.forEach(site => {
      const variance = site.it_allocation_variance
      if (variance > 0) {
        varianceTotals.missing += variance
      } else if (variance < 0) {
        varianceTotals.untracked += Math.abs(variance)
      }
      varianceTotals.correct += site.on_site_total - Math.abs(variance)
    })
    return transformVarianceSummary(varianceTotals)
  }, [sites])

  return (
    <div className="space-y-6">
      {/* Portfolio KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="Total Sites"
          value={totals.sites_count}
          icon={<Building2 className="w-6 h-6" />}
          color="blue"
          subtitle="Managed sites"
        />
        <KPICard
          title="Total Assets"
          value={totals.on_site_total}
          icon={<Package className="w-6 h-6" />}
          color="blue"
          subtitle="Across all sites"
        />
        <KPICard
          title="Total Audits"
          value={totalAudits}
          icon={<FileText className="w-6 h-6" />}
          color="green"
          subtitle="Completed audits"
        />
        <KPICard
          title="Overdue Audits"
          value={legacyPortfolio?.sites_with_overdue_audits ?? 0}
          icon={<AlertTriangle className="w-6 h-6" />}
          color={legacyPortfolio?.sites_with_overdue_audits ? 'red' : 'green'}
          subtitle="Sites needing audit"
        />
        <KPICard
          title="Inactive Devices"
          value={totals.inactive_count}
          icon={<WifiOff className="w-6 h-6" />}
          color={totals.inactive_count === 0 ? 'green' : 'red'}
          subtitle="Not connected"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-gray-500" />
              Portfolio GL Accuracy Trend
            </h3>
          </div>
          <TrendLineChart data={trends} height={220} showSavings />
        </div>

        {/* Variance Chart */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-gray-500" />
              Portfolio Variance Distribution
            </h3>
          </div>
          <VarianceDonutChart data={portfolioVarianceData} height={220} />
        </div>
      </div>

      {/* Sites Table with Sorting and Quick Filters */}
      <SiteSummaryTable sites={sites} onSelectSite={onSelectSite} />
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
