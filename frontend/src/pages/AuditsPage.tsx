import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { auditsApi, sitesApi } from '../services/api'
import { format } from 'date-fns'
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Clock,
  XCircle,
  ChevronRight,
} from 'lucide-react'
import type { ProcessingStatus } from '../types'

const statusConfig: Record<ProcessingStatus, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-gray-500', label: 'Pending' },
  processing: { icon: Clock, color: 'text-blue-500', label: 'Processing' },
  completed: { icon: CheckCircle, color: 'text-green-500', label: 'Completed' },
  completed_with_warnings: { icon: AlertTriangle, color: 'text-yellow-500', label: 'Completed with Warnings' },
  error: { icon: XCircle, color: 'text-red-500', label: 'Error' },
}

export default function AuditsPage() {
  const { data: audits, isLoading } = useQuery({
    queryKey: ['audits'],
    queryFn: () => auditsApi.list({ limit: 50 }),
  })

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  const getSiteName = (siteCode: string) => {
    const site = sites?.find((s) => s.site_code === siteCode)
    return site?.site_name || siteCode
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audits</h1>
          <p className="text-sm text-gray-500 mt-1">
            View and manage physical audit submissions
          </p>
        </div>
        <Link to="/upload" className="btn-primary">
          <FileText className="w-4 h-4 mr-2" />
          New Audit
        </Link>
      </div>

      <div className="card overflow-hidden">
        {audits && audits.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {audits.map((audit) => {
              const status = statusConfig[audit.processing_status]
              const StatusIcon = status.icon

              return (
                <li key={audit.audit_id}>
                  <Link
                    to={`/audits/${audit.audit_id}`}
                    className="flex items-center px-4 py-4 hover:bg-gray-50"
                  >
                    <div className="flex-shrink-0">
                      <StatusIcon className={`w-6 h-6 ${status.color}`} />
                    </div>
                    <div className="ml-4 flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {audit.site_code} - {getSiteName(audit.site_code)}
                        </p>
                        <span
                          className={`ml-2 px-2 py-1 text-xs font-medium rounded ${
                            audit.processing_status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : audit.processing_status === 'completed_with_warnings'
                              ? 'bg-yellow-100 text-yellow-700'
                              : audit.processing_status === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center text-sm text-gray-500">
                        <span>
                          Audit Date: {format(new Date(audit.audit_date), 'MMM d, yyyy')}
                        </span>
                        <span className="mx-2">|</span>
                        <span>Auditor: {audit.auditor_name}</span>
                        <span className="mx-2">|</span>
                        <span>{audit.total_assets_found} assets</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 ml-4" />
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-gray-400" />
            <p className="mt-4 text-sm text-gray-500">No audits found</p>
            <Link to="/upload" className="mt-4 inline-block btn-primary">
              Upload Your First Audit
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
