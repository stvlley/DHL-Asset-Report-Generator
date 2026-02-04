import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { itAllocationApi } from '../services/api'
import type { ITAllocationSnapshot, ITAllocationDevice, GLStringSummary } from '../types'
import {
  Upload,
  FileSpreadsheet,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  Loader2,
  HardDrive,
  Database,
} from 'lucide-react'

export default function ITAllocationPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    status: string
    message: string
    rf_hardware_count?: number
    rf_software_count?: number
    unique_devices?: number
  } | null>(null)
  const [expandedSnapshot, setExpandedSnapshot] = useState<string | null>(null)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [searchResult, setSearchResult] = useState<{
    found: boolean
    hsn?: string | null
    device_model?: string | null
    gl_string?: string | null
    category?: string | null
    amount?: number | null
  } | null>(null)

  const queryClient = useQueryClient()

  // Fetch snapshots
  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['it-allocation-snapshots'],
    queryFn: () => itAllocationApi.listSnapshots(12),
  })

  // Fetch GL summary for latest snapshot
  const { data: glSummary } = useQuery({
    queryKey: ['it-allocation-gl-summary'],
    queryFn: () => itAllocationApi.getGLSummary(),
  })

  // Fetch devices for expanded snapshot
  const { data: snapshotDevices, isLoading: devicesLoading } = useQuery({
    queryKey: ['it-allocation-devices', expandedSnapshot],
    queryFn: () =>
      expandedSnapshot ? itAllocationApi.getSnapshotDevices(expandedSnapshot, { limit: 50 }) : null,
    enabled: !!expandedSnapshot,
  })

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => itAllocationApi.upload(file),
    onSuccess: (data) => {
      setUploadResult({
        status: data.status,
        message: data.message,
        rf_hardware_count: data.rf_hardware_count,
        rf_software_count: data.rf_software_count,
        unique_devices: data.unique_devices,
      })
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['it-allocation-snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['it-allocation-gl-summary'] })
    },
    onError: (error: Error) => {
      setUploadResult({
        status: 'error',
        message: error.message || 'Upload failed',
      })
    },
  })

  // Device lookup mutation
  const lookupMutation = useMutation({
    mutationFn: (serial: string) => itAllocationApi.lookupDevice(serial),
    onSuccess: (data) => {
      setSearchResult(data)
    },
    onError: () => {
      setSearchResult({ found: false })
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadResult(null)
    }
  }

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile)
    }
  }

  const handleSearch = () => {
    if (deviceSearch.trim()) {
      lookupMutation.mutate(deviceSearch.trim())
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatPeriod = (period: number, year: number) => {
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]
    return `${monthNames[period - 1]} ${year}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">IT Allocation</h1>
        <p className="text-gray-600">
          Upload and manage monthly IT cost allocation data for RF Hardware and Software
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upload Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload IT Allocation Data
            </h2>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 mb-4">
                Upload monthly IT Allocation Excel file (.xlsx)
              </p>

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="btn-secondary cursor-pointer inline-block"
              >
                Select File
              </label>

              {selectedFile && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    Selected: <span className="font-medium">{selectedFile.name}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}

              {selectedFile && (
                <button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  className="btn-primary mt-4"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Upload & Process'
                  )}
                </button>
              )}
            </div>

            {/* Upload Result */}
            {uploadResult && (
              <div
                className={`mt-4 p-4 rounded-lg ${
                  uploadResult.status === 'success'
                    ? 'bg-green-50 text-green-800'
                    : 'bg-red-50 text-red-800'
                }`}
              >
                <div className="flex items-start gap-2">
                  {uploadResult.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">{uploadResult.message}</p>
                    {uploadResult.status === 'success' && (
                      <p className="text-sm mt-1">
                        RF Hardware: {uploadResult.rf_hardware_count} |
                        RF Software: {uploadResult.rf_software_count} |
                        Unique Devices: {uploadResult.unique_devices}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload History */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Upload History
            </h2>

            {snapshotsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : snapshots && snapshots.length > 0 ? (
              <div className="space-y-3">
                {snapshots.map((snapshot: ITAllocationSnapshot) => (
                  <div
                    key={snapshot.snapshot_id}
                    className="border rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedSnapshot(
                          expandedSnapshot === snapshot.snapshot_id
                            ? null
                            : snapshot.snapshot_id
                        )
                      }
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <p className="font-medium">
                            {formatPeriod(snapshot.period, snapshot.year)}
                          </p>
                          <p className="text-sm text-gray-500">
                            Uploaded {formatDate(snapshot.upload_timestamp)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right text-sm">
                          <p>
                            <span className="text-blue-600">{snapshot.rf_hardware_count}</span> HW
                            {' | '}
                            <span className="text-purple-600">{snapshot.rf_software_count}</span> SW
                          </p>
                          <p className="text-gray-500">
                            {snapshot.total_records} total records
                          </p>
                        </div>
                        {expandedSnapshot === snapshot.snapshot_id ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Device List */}
                    {expandedSnapshot === snapshot.snapshot_id && (
                      <div className="border-t bg-gray-50 p-4">
                        {devicesLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          </div>
                        ) : snapshotDevices && snapshotDevices.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="text-left text-gray-500">
                                  <th className="pb-2">HSN</th>
                                  <th className="pb-2">Model</th>
                                  <th className="pb-2">Category</th>
                                  <th className="pb-2">GL String</th>
                                  <th className="pb-2 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {snapshotDevices.map((device: ITAllocationDevice) => (
                                  <tr key={device.device_id} className="border-t border-gray-200">
                                    <td className="py-2 font-mono text-xs">{device.hsn || '-'}</td>
                                    <td className="py-2">{device.device_model || '-'}</td>
                                    <td className="py-2">
                                      <span
                                        className={`px-2 py-0.5 rounded text-xs ${
                                          device.category === 'RF HARDWARE'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-purple-100 text-purple-800'
                                        }`}
                                      >
                                        {device.category}
                                      </span>
                                    </td>
                                    <td className="py-2 font-mono text-xs">{device.gl_string}</td>
                                    <td className="py-2 text-right">
                                      ${device.amount?.toFixed(2) || '0.00'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {snapshotDevices.length >= 50 && (
                              <p className="text-xs text-gray-500 mt-2 text-center">
                                Showing first 50 devices
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-center py-4">No devices found</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                No uploads yet. Upload your first IT Allocation file above.
              </p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Device Lookup */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Search className="w-5 h-5" />
              Device Lookup
            </h2>

            <div className="flex gap-2">
              <input
                type="text"
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter HSN or MAC"
                className="input flex-1"
              />
              <button
                onClick={handleSearch}
                disabled={lookupMutation.isPending || !deviceSearch.trim()}
                className="btn-primary"
              >
                {lookupMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </button>
            </div>

            {searchResult && (
              <div className="mt-4">
                {searchResult.found ? (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="font-medium text-green-800 mb-2">Device Found</p>
                    <dl className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <dt className="text-gray-600">HSN:</dt>
                        <dd className="font-mono">{searchResult.hsn}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Model:</dt>
                        <dd>{searchResult.device_model}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">GL String:</dt>
                        <dd className="font-mono text-xs">{searchResult.gl_string}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Category:</dt>
                        <dd>{searchResult.category}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">Amount:</dt>
                        <dd>${searchResult.amount?.toFixed(2)}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <p className="text-yellow-800">
                      Device not found in IT Allocation data
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* GL Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              GL String Summary
            </h2>

            {glSummary && glSummary.length > 0 ? (
              <div className="space-y-3">
                {glSummary.map((gl: GLStringSummary) => (
                  <div
                    key={`${gl.gl_string}-${gl.category}`}
                    className="p-3 bg-gray-50 rounded-lg"
                  >
                    <p className="font-mono text-xs text-gray-700">{gl.gl_string}</p>
                    <div className="flex justify-between mt-1 text-sm">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          gl.category === 'RF HARDWARE'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {gl.category}
                      </span>
                      <span className="text-gray-600">
                        {gl.device_count} devices | ${gl.total_amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">
                No GL data available. Upload IT Allocation data first.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
