import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pbiApi, sitesApi, appSettingsApi } from '../services/api'
import type { PBIDevice } from '../types'
import {
  Upload,
  Wifi,
  WifiOff,
  ChevronDown,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  MessageSquare,
  Ticket,
  RefreshCw,
} from 'lucide-react'

export default function PBIImportPage() {
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    status: string
    message: string
    connected_count?: number
    disconnected_count?: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Fetch sites
  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  // Fetch inactive threshold setting
  const { data: thresholdSetting } = useQuery({
    queryKey: ['inactive-threshold'],
    queryFn: () => appSettingsApi.getInactiveThreshold(),
  })

  // Fetch PBI snapshots for selected site
  const { data: snapshotsData, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['pbi-snapshots', selectedSite],
    queryFn: () => pbiApi.listSnapshots(selectedSite),
    enabled: !!selectedSite,
  })

  // Fetch inactive devices for selected site
  const { data: inactiveData, isLoading: inactiveLoading } = useQuery({
    queryKey: ['pbi-inactive', selectedSite],
    queryFn: () => pbiApi.getInactiveDevices(selectedSite),
    enabled: !!selectedSite,
  })

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: ({ file, siteCode }: { file: File; siteCode: string }) =>
      pbiApi.upload(file, siteCode),
    onSuccess: (data) => {
      setUploadResult(data)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      queryClient.invalidateQueries({ queryKey: ['pbi-snapshots', selectedSite] })
      queryClient.invalidateQueries({ queryKey: ['pbi-inactive', selectedSite] })
    },
    onError: (error: Error) => {
      setUploadResult({
        status: 'error',
        message: error.message || 'Upload failed',
      })
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadResult(null)
    }
  }

  const handleUpload = () => {
    if (selectedFile && selectedSite) {
      uploadMutation.mutate({ file: selectedFile, siteCode: selectedSite })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PBI/SOTI Import</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload device connection status from Power BI or SOTI exports
          </p>
        </div>

        {/* Site Selector */}
        <div className="relative">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-dhl-yellow"
          >
            <option value="">Select a site...</option>
            {sites?.map((site) => (
              <option key={site.site_code} value={site.site_code}>
                {site.site_code} - {site.site_name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {!selectedSite ? (
        <div className="card p-8 text-center">
          <Wifi className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Select a site to view PBI data and upload new imports</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <div className="lg:col-span-1 space-y-4">
            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload PBI/SOTI Data
              </h2>

              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-dhl-yellow transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <FileSpreadsheet className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  {selectedFile ? (
                    <p className="text-sm text-gray-900 font-medium">{selectedFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">Click to select file</p>
                      <p className="text-xs text-gray-400 mt-1">CSV or Excel (.csv, .xlsx)</p>
                    </>
                  )}
                </div>

                {selectedFile && (
                  <button
                    onClick={handleUpload}
                    disabled={uploadMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-dhl-yellow text-gray-900 rounded-lg font-medium hover:bg-yellow-400 transition-colors disabled:opacity-50"
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload
                      </>
                    )}
                  </button>
                )}

                {uploadResult && (
                  <div
                    className={`p-3 rounded-lg ${
                      uploadResult.status === 'success'
                        ? 'bg-green-50 text-green-800'
                        : 'bg-red-50 text-red-800'
                    }`}
                  >
                    <p className="text-sm font-medium">{uploadResult.message}</p>
                    {uploadResult.connected_count !== undefined && (
                      <p className="text-xs mt-1">
                        Connected: {uploadResult.connected_count} |
                        Disconnected: {uploadResult.disconnected_count}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Expected Columns:</h3>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• <strong>SerialNumber</strong> (or SN, Serial)</li>
                  <li>• <strong>Status</strong> (or ConnectionStatus)</li>
                  <li>• Model (optional)</li>
                </ul>
              </div>
            </div>

            {/* Settings */}
            <div className="card p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Settings</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Inactive Threshold:</span>
                <span className="font-medium">
                  {thresholdSetting?.inactive_threshold_days || 30} days
                </span>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Connection Summary */}
            {inactiveData && (
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Wifi className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {(snapshotsData?.snapshots?.[0]?.connected_count) || 0}
                      </p>
                      <p className="text-sm text-gray-500">Connected</p>
                    </div>
                  </div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <WifiOff className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {inactiveData.count}
                      </p>
                      <p className="text-sm text-gray-500">
                        {inactiveData.inactive_threshold_days}-Day Inactive
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Inactive Devices Table */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Inactive Devices ({inactiveData?.count || 0})
                </h3>
                <span className="text-sm text-gray-500">
                  Devices not connected in last {inactiveData?.inactive_threshold_days || 30} days
                </span>
              </div>

              {inactiveLoading ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                </div>
              ) : inactiveData?.devices?.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p>All devices are connected!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Serial Number
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Model
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Justification
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {inactiveData?.devices?.map((device) => (
                        <InactiveDeviceRow
                          key={device.device_id}
                          device={device}
                          onJustificationAdded={() => {
                            queryClient.invalidateQueries({
                              queryKey: ['pbi-inactive', selectedSite],
                            })
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Upload History */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Upload History</h3>
              </div>

              {snapshotsLoading ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
                </div>
              ) : snapshotsData?.snapshots?.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p>No uploads yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Period
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          File
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Total
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Connected
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Disconnected
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {snapshotsData?.snapshots?.map((snapshot) => (
                        <tr key={snapshot.snapshot_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {snapshot.upload_timestamp
                              ? new Date(snapshot.upload_timestamp).toLocaleDateString()
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {snapshot.period}/{snapshot.year}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                            {snapshot.file_name || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium">
                            {snapshot.total_records}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-green-600">
                            {snapshot.connected_count}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-red-600">
                            {snapshot.disconnected_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Inactive Device Row with Justification
function InactiveDeviceRow({
  device,
  onJustificationAdded,
}: {
  device: PBIDevice
  onJustificationAdded: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [justification, setJustification] = useState(device.justification || '')
  const [ticketNumber, setTicketNumber] = useState(device.ticket_number || '')

  const justificationMutation = useMutation({
    mutationFn: () =>
      pbiApi.addJustification(device.device_id, justification, ticketNumber || undefined),
    onSuccess: () => {
      setIsEditing(false)
      onJustificationAdded()
    },
  })

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">
        {device.serial_number}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{device.model || '-'}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
          <WifiOff className="w-3 h-3 mr-1" />
          {device.connection_status || 'Not connected'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm">
        {isEditing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Enter justification..."
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
            />
            <input
              type="text"
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              placeholder="Ticket # (optional)"
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
            />
            <div className="flex gap-2">
              <button
                onClick={() => justificationMutation.mutate()}
                disabled={!justification || justificationMutation.isPending}
                className="px-2 py-1 text-xs bg-dhl-yellow text-gray-900 rounded hover:bg-yellow-400 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : device.justification ? (
          <div>
            <p className="text-gray-700">{device.justification}</p>
            {device.ticket_number && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                <Ticket className="w-3 h-3" /> {device.ticket_number}
              </p>
            )}
          </div>
        ) : (
          <span className="text-gray-400 italic">No justification</span>
        )}
      </td>
      <td className="px-4 py-3">
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-dhl-red hover:underline flex items-center gap-1"
          >
            <MessageSquare className="w-3 h-3" />
            {device.justification ? 'Edit' : 'Add'}
          </button>
        )}
      </td>
    </tr>
  )
}
