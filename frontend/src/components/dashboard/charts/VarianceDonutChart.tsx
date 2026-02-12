/**
 * Variance breakdown donut chart for dashboard.
 * Shows distribution of variance types with center total.
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface VarianceData {
  type: string
  count: number
  label?: string
}

interface VarianceDonutChartProps {
  data: VarianceData[]
  height?: number
  onSegmentClick?: (type: string) => void
}

const VARIANCE_COLORS: Record<string, string> = {
  CORRECT: '#22c55e',        // green-500
  MISSING: '#ef4444',        // red-500
  MISALLOCATED: '#f59e0b',   // amber-500
  UNTRACKED: '#3b82f6',      // blue-500
  CONDITION_MISMATCH: '#a855f7', // purple-500
  GL_MISMATCH: '#f97316',    // orange-500
}

const VARIANCE_LABELS: Record<string, string> = {
  CORRECT: 'Correct',
  MISSING: 'Missing',
  MISALLOCATED: 'Misallocated',
  UNTRACKED: 'Untracked',
  CONDITION_MISMATCH: 'Condition',
  GL_MISMATCH: 'GL Mismatch',
}

export default function VarianceDonutChart({
  data,
  height = 200,
  onSegmentClick,
}: VarianceDonutChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No variance data available
      </div>
    )
  }

  // Add labels and filter out zero values
  const chartData = data
    .filter(d => d.count > 0)
    .map(d => ({
      ...d,
      label: d.label || VARIANCE_LABELS[d.type] || d.type,
      color: VARIANCE_COLORS[d.type] || '#9ca3af',
    }))

  const total = chartData.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={2}
            dataKey="count"
            nameKey="label"
            onClick={(entry) => onSegmentClick?.(entry.type)}
            style={{ cursor: onSegmentClick ? 'pointer' : 'default' }}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip total={total} />} />
          <Legend
            verticalAlign="middle"
            align="right"
            layout="vertical"
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span className="text-xs text-gray-600">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center Label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center" style={{ marginRight: '80px' }}>
          <p className="text-2xl font-bold text-gray-900">{total}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
      </div>
    </div>
  )
}

function CustomTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: Array<{ payload: VarianceData & { label: string; color: string } }>
  total: number
}) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0].payload
  const percentage = ((data.count / total) * 100).toFixed(1)

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-sm">
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: data.color }}
        />
        <span className="font-medium">{data.label}</span>
      </div>
      <p className="text-gray-600 mt-1">
        {data.count} ({percentage}%)
      </p>
    </div>
  )
}

// Helper to transform variance summary to chart data
export function transformVarianceSummary(summary: {
  correct?: number
  missing?: number
  misallocated?: number
  untracked?: number
  condition_mismatch?: number
}): VarianceData[] {
  return [
    { type: 'CORRECT', count: summary.correct || 0 },
    { type: 'MISSING', count: summary.missing || 0 },
    { type: 'MISALLOCATED', count: summary.misallocated || 0 },
    { type: 'UNTRACKED', count: summary.untracked || 0 },
    { type: 'CONDITION_MISMATCH', count: summary.condition_mismatch || 0 },
  ]
}
