import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dashboardApi } from '../services/api'
import {
  Building2,
  Package,
  TrendingUp,
  AlertTriangle,
  Clock,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export default function DashboardPage() {
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio-summary'],
    queryFn: () => dashboardApi.getPortfolioSummary(),
  })

  const { data: trends } = useQuery({
    queryKey: ['trends'],
    queryFn: () => dashboardApi.getTrends({ months: 6 }),
  })

  if (portfolioLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Portfolio Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of asset audit status across all sites
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="card p-4">
          <div className="flex items-center">
            <Building2 className="w-8 h-8 text-gray-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Sites</p>
              <p className="text-2xl font-semibold text-gray-900">
                {portfolio?.total_sites || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center">
            <Package className="w-8 h-8 text-gray-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Assets in GL</p>
              <p className="text-2xl font-semibold text-gray-900">
                {portfolio?.total_assets_in_gl?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center">
            <TrendingUp className="w-8 h-8 text-status-correct" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">GL Accuracy</p>
              <p className="text-2xl font-semibold text-gray-900">
                {portfolio?.total_gl_accuracy_pct?.toFixed(1) || '--'}%
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center">
            <DollarSign className="w-8 h-8 text-status-warning" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Potential Savings</p>
              <p className="text-2xl font-semibold text-gray-900">
                ${portfolio?.total_potential_savings?.toLocaleString() || 0}/mo
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-status-error" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Overdue Audits</p>
              <p className="text-2xl font-semibold text-gray-900">
                {portfolio?.sites_with_overdue_audits || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-8 h-8 text-status-error" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">High Priority</p>
              <p className="text-2xl font-semibold text-gray-900">
                {portfolio?.high_priority_items || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts and Site Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-1 card p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            GL Accuracy Trend
          </h2>
          {trends?.trends && trends.trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trends.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="gl_accuracy_pct"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: '#10B981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-500">
              No trend data available
            </div>
          )}
        </div>

        {/* Site Performance Table */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Site Performance
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Site
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Assets
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    GL Accuracy
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Audit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Issues
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {portfolio?.site_details?.slice(0, 10).map((site) => (
                  <tr key={site.site_code} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {site.site_code}
                        </p>
                        <p className="text-xs text-gray-500">{site.site_name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {site.assets_in_gl}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        <span
                          className={`text-sm font-medium ${
                            (site.gl_accuracy_pct || 0) >= 90
                              ? 'text-status-correct'
                              : (site.gl_accuracy_pct || 0) >= 80
                              ? 'text-status-warning'
                              : 'text-status-error'
                          }`}
                        >
                          {site.gl_accuracy_pct?.toFixed(1) || '--'}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {site.is_overdue ? (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded">
                          <Clock className="w-3 h-3 mr-1" />
                          Overdue
                        </span>
                      ) : site.audit_date ? (
                        <span className="text-sm text-gray-500">
                          {site.audit_date}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {site.high_priority_items > 0 && (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded">
                          {site.high_priority_items} high
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {portfolio?.site_details && portfolio.site_details.length > 10 && (
            <div className="p-4 border-t border-gray-200 text-center">
              <Link
                to="/sites"
                className="text-sm text-dhl-red hover:underline"
              >
                View all {portfolio.site_details.length} sites
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/upload"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0 p-2 bg-dhl-yellow rounded-lg">
              <ArrowUpRight className="w-6 h-6 text-gray-900" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-900">Upload New Audit</p>
              <p className="text-xs text-gray-500">
                Submit a monthly physical audit
              </p>
            </div>
          </Link>

          <Link
            to="/audits"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0 p-2 bg-blue-100 rounded-lg">
              <ArrowDownRight className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-900">View Recent Audits</p>
              <p className="text-xs text-gray-500">
                Review audit results and actions
              </p>
            </div>
          </Link>

          <Link
            to="/master-data"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex-shrink-0 p-2 bg-green-100 rounded-lg">
              <Package className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-900">Manage Master Data</p>
              <p className="text-xs text-gray-500">
                View and update asset database
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
