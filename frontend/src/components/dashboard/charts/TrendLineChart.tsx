/**
 * GL Accuracy Trend Line Chart for dashboard.
 * Shows 6-month trend with area fill and target reference line.
 */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface TrendData {
  month: string
  gl_accuracy_pct: number | null
  potential_savings: number
  total_assets: number
}

interface TrendLineChartProps {
  data: TrendData[]
  height?: number
  showSavings?: boolean
}

export default function TrendLineChart({
  data,
  height = 200,
  showSavings = false,
}: TrendLineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No trend data available
      </div>
    )
  }

  // Format month labels (e.g., "2024-01" -> "Jan")
  const formattedData = data.map(d => ({
    ...d,
    monthLabel: new Date(d.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={formattedData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="glAccuracyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FFCC00" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#FFCC00" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="monthLabel"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
        />
        <YAxis
          domain={[80, 100]}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
          tickFormatter={(value) => `${value}%`}
          width={45}
        />
        <Tooltip
          content={<CustomTooltip showSavings={showSavings} />}
        />
        <ReferenceLine
          y={95}
          stroke="#D40511"
          strokeDasharray="5 5"
          label={{
            value: 'Target 95%',
            position: 'right',
            fill: '#D40511',
            fontSize: 10,
          }}
        />
        <Area
          type="monotone"
          dataKey="gl_accuracy_pct"
          stroke="#FFCC00"
          strokeWidth={2}
          fill="url(#glAccuracyGradient)"
          dot={{ r: 3, fill: '#FFCC00', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#FFCC00' }}
          name="GL Accuracy"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function CustomTooltip({
  active,
  payload,
  showSavings,
}: {
  active?: boolean
  payload?: Array<{ payload: TrendData & { monthLabel: string } }>
  showSavings: boolean
}) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0].payload

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-900">{data.monthLabel}</p>
      <div className="mt-1 space-y-1">
        <p className="text-gray-600">
          GL Accuracy:{' '}
          <span className={`font-medium ${
            (data.gl_accuracy_pct || 0) >= 95 ? 'text-green-600' : 'text-yellow-600'
          }`}>
            {data.gl_accuracy_pct?.toFixed(1) ?? 'N/A'}%
          </span>
        </p>
        {showSavings && (
          <p className="text-gray-600">
            Potential Savings:{' '}
            <span className="font-medium text-green-600">
              ${data.potential_savings.toLocaleString()}/mo
            </span>
          </p>
        )}
        <p className="text-gray-500 text-xs">
          {data.total_assets.toLocaleString()} assets
        </p>
      </div>
    </div>
  )
}
