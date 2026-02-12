/**
 * KPI Card component for dashboard metrics display.
 * Supports variance display, sparklines, and different color schemes.
 */
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface KPICardProps {
  title: string
  value: number
  total?: number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'yellow' | 'red'
  isVariance?: boolean
  subtitle?: string
  comment?: string | null
  trend?: number[] // Data for mini sparkline
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  red: 'bg-red-50 text-red-600',
}

export default function KPICard({
  title,
  value,
  total,
  icon,
  color,
  isVariance,
  subtitle,
  comment,
  trend,
}: KPICardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        {isVariance && total !== undefined && (
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
        {/* Mini Sparkline */}
        {trend && trend.length > 1 && (
          <MiniSparkline data={trend} color={color} />
        )}
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

// Inline Mini Sparkline Component
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const width = 60
  const height = 20
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  const strokeColor = color === 'green' ? '#22c55e' :
                      color === 'red' ? '#ef4444' :
                      color === 'yellow' ? '#eab308' : '#3b82f6'

  // Calculate trend direction
  const isUp = data[data.length - 1] > data[0]

  return (
    <div className="flex items-center gap-1 mt-1">
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`text-xs ${isUp ? 'text-green-600' : 'text-red-600'}`}>
        {isUp ? '↑' : '↓'}
      </span>
    </div>
  )
}
