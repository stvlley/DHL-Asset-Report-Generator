/**
 * Single alert item component for dashboard alerts.
 */
import { Link } from 'react-router-dom'
import { X, AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react'
import type { DashboardAlert } from '../../../types'

interface AlertItemProps {
  alert: DashboardAlert
  onDismiss?: (id: string) => void
}

const severityConfig = {
  critical: {
    bg: 'bg-red-50 border-red-200',
    icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
    text: 'text-red-800',
  },
  warning: {
    bg: 'bg-yellow-50 border-yellow-200',
    icon: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    text: 'text-yellow-800',
  },
  info: {
    bg: 'bg-blue-50 border-blue-200',
    icon: <Info className="w-5 h-5 text-blue-500" />,
    text: 'text-blue-800',
  },
}

export default function AlertItem({ alert, onDismiss }: AlertItemProps) {
  const config = severityConfig[alert.severity]

  const content = (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${config.bg}`}>
      {config.icon}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${config.text}`}>
          {alert.title}
        </p>
        <p className={`text-xs ${config.text} opacity-80 mt-0.5`}>
          {alert.description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {alert.actionUrl && (
          <ExternalLink className={`w-4 h-4 ${config.text} opacity-60`} />
        )}
        {onDismiss && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDismiss(alert.id)
            }}
            className={`p-1 rounded hover:bg-white/50 ${config.text}`}
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )

  if (alert.actionUrl) {
    return (
      <Link to={alert.actionUrl} className="block hover:opacity-90 transition-opacity">
        {content}
      </Link>
    )
  }

  return content
}
