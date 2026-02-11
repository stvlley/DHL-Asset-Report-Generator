/**
 * Report Section component for audit pages.
 * Provides report generation and email sending functionality.
 */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { reportsApi } from '../../services/api'
import {
  FileText,
  Mail,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  X,
} from 'lucide-react'

interface ReportSectionProps {
  siteCode: string
  auditId?: string
}

export default function ReportSection({ siteCode }: ReportSectionProps) {
  const [showRecipients, setShowRecipients] = useState(false)
  const [customRecipients, setCustomRecipients] = useState<string[]>([])
  const [newRecipient, setNewRecipient] = useState('')

  // Fetch recipients
  const { data: recipients } = useQuery({
    queryKey: ['report-recipients', siteCode],
    queryFn: () => reportsApi.getRecipients(siteCode),
  })

  // Generate report mutation
  const generateMutation = useMutation({
    mutationFn: () => reportsApi.generate(siteCode),
  })

  // Send report mutation
  const sendMutation = useMutation({
    mutationFn: (recipientList?: string[]) =>
      reportsApi.send(siteCode, {
        recipients: recipientList && recipientList.length > 0 ? recipientList : undefined,
      }),
  })

  const handleAddRecipient = () => {
    if (newRecipient && newRecipient.includes('@')) {
      setCustomRecipients([...customRecipients, newRecipient])
      setNewRecipient('')
    }
  }

  const handleRemoveRecipient = (email: string) => {
    setCustomRecipients(customRecipients.filter((r) => r !== email))
  }

  const allRecipients = [
    ...(recipients?.all_recipients ?? []),
    ...customRecipients,
  ]

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Report Actions
        </h3>
      </div>

      <div className="space-y-4">
        {/* Generate Report */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium text-gray-900">Generate Report</p>
            <p className="text-sm text-gray-500">Create an Excel report for this audit</p>
          </div>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-dhl-yellow text-gray-900 rounded-lg text-sm font-medium hover:bg-yellow-400 transition-colors disabled:opacity-50"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {generateMutation.isPending ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {generateMutation.isSuccess && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm">{generateMutation.data?.message || 'Report generated successfully'}</span>
          </div>
        )}

        {generateMutation.isError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to generate report</span>
          </div>
        )}

        {/* Send Report */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Send Report</p>
              <p className="text-sm text-gray-500">Email the report to stakeholders</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRecipients(!showRecipients)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                title="Manage recipients"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => sendMutation.mutate(customRecipients.length > 0 ? allRecipients : undefined)}
                disabled={sendMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                {sendMutation.isPending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>

          {/* Recipients section */}
          {showRecipients && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-2">Recipients</p>

              {/* Default recipients */}
              {recipients?.all_recipients && recipients.all_recipients.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Default recipients:</p>
                  <div className="flex flex-wrap gap-1">
                    {recipients.all_recipients.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-700"
                      >
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom recipients */}
              {customRecipients.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Additional recipients:</p>
                  <div className="flex flex-wrap gap-1">
                    {customRecipients.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700"
                      >
                        {email}
                        <button
                          onClick={() => handleRemoveRecipient(email)}
                          className="hover:text-blue-900"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Add recipient */}
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Add email..."
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRecipient()}
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddRecipient}
                  className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        {sendMutation.isSuccess && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm">{sendMutation.data?.message || 'Report sent successfully'}</span>
          </div>
        )}

        {sendMutation.isError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to send report</span>
          </div>
        )}
      </div>
    </div>
  )
}
