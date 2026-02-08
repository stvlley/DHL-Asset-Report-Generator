import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { assetManagementApi, sitesApi, itAllocationApi } from '../services/api'
import {
  Database,
  Upload,
  Search,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  X,
  Wifi,
  WifiOff,
  DollarSign,
  BarChart3,
  RefreshCw,
  ArrowRight,
  FileText,
} from 'lucide-react'

export default function MasterDataPage() {
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showMdmUpload, setShowMdmUpload] = useState(false)
  const [mdmFile, setMdmFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    status: 'success' | 'error'
    message: string
    stats?: {
      total_rows: number
      matched: number
      unmatched: number
      connected: number
      disconnected: number
      errors?: Array<{ row: number; error: string }>
    }
  } | null>(null)
  const queryClient = useQueryClient()

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  const { data: snapshots } = useQuery({
    queryKey: ['it-allocation-snapshots'],
    queryFn: () => itAllocationApi.listSnapshots(6),
  })

  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['assets-managed', selectedSite, searchTerm],
    queryFn: () =>
      assetManagementApi.list({
        site_code: selectedSite || undefined,
        search: searchTerm || undefined,
        limit: 100,
      }),
  })

  const { data: reconciliation } = useQuery({
    queryKey: ['reconciliation-summary', selectedSite],
    queryFn: () => assetManagementApi.getReconciliationSummary(selectedSite),
    enabled: !!selectedSite,
  })

  const { data: disconnected } = useQuery({
    queryKey: ['disconnected-devices', selectedSite],
    queryFn: () => assetManagementApi.getDisconnected(selectedSite || undefined, 60),
  })

  // MDM Status Upload
  const mdmUploadMutation = useMutation({
    mutationFn: ({ file, siteCode }: { file: File; siteCode?: string }) =>
      assetManagementApi.uploadMdmStatus(file, siteCode),
    onSuccess: (result) => {
      setUploadResult({
        status: 'success',
        message: result.message,
        stats: result.stats,
      })
      setMdmFile(null)
      queryClient.invalidateQueries({ queryKey: ['assets-managed'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation-summary'] })
      queryClient.invalidateQueries({ queryKey: ['disconnected-devices'] })
    },
    onError: (error: Error) => {
      setUploadResult({
        status: 'error',
        message: error.message,
      })
    },
  })

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setMdmFile(acceptedFiles[0])
      setUploadResult(null)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  })

  const handleMdmUpload = () => {
    if (mdmFile) {
      mdmUploadMutation.mutate({ file: mdmFile, siteCode: selectedSite || undefined })
    }
  }

  const assets = assetsData?.items || []
  const latestSnapshot = snapshots?.[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master Data</h1>
          <p className="text-sm text-gray-500 mt-1">
            Asset database built from IT Allocation with MDM connectivity status
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => queryClient.invalidateQueries()}
            className="btn-secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={() => setShowMdmUpload(!showMdmUpload)}
            className="btn-primary"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload MDM Status
          </button>
        </div>
      </div>

      {/* How It Works */}
      <div className="card p-4 bg-blue-50 border-blue-200">
        <h3 className="font-medium text-blue-900 mb-2">How Master Data Works</h3>
        <div className="flex items-center gap-4 text-sm text-blue-800">
          <div className="flex items-center">
            <FileText className="w-5 h-5 mr-2" />
            <span>IT Allocation Upload</span>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-400" />
          <div className="flex items-center">
            <Database className="w-5 h-5 mr-2" />
            <span>Master Database</span>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-400" />
          <div className="flex items-center">
            <Wifi className="w-5 h-5 mr-2" />
            <span>MDM Status Overlay</span>
          </div>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          Master data is automatically built from IT Allocation uploads.
          Upload MDM/SOTI status separately to track device connectivity.
          {latestSnapshot && (
            <span className="ml-1">
              Latest allocation: Period {latestSnapshot.period}/{latestSnapshot.year}
            </span>
          )}
        </p>
      </div>

      {/* Disconnected Devices Alert */}
      {disconnected && disconnected.count > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800">
                {disconnected.count} Device{disconnected.count > 1 ? 's' : ''} Not Connected
              </h3>
              <p className="text-sm text-amber-700 mt-1">
                These devices haven't connected to MDM in {disconnected.days_threshold}+ days.
                They may be lost, damaged, or require investigation.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {disconnected.devices.slice(0, 5).map((device) => (
                  <span
                    key={device.asset_id}
                    className="inline-flex items-center px-2 py-1 rounded text-xs bg-amber-100 text-amber-800"
                  >
                    <WifiOff className="w-3 h-3 mr-1" />
                    {device.serial_number}
                  </span>
                ))}
                {disconnected.count > 5 && (
                  <span className="text-xs text-amber-600">
                    +{disconnected.count - 5} more
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {selectedSite && reconciliation && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="card p-4">
            <div className="flex items-center">
              <Database className="w-8 h-8 text-blue-500" />
              <div className="ml-3">
                <p className="text-2xl font-bold">{reconciliation.total_assets}</p>
                <p className="text-xs text-gray-500">Total Assets</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-green-500" />
              <div className="ml-3">
                <p className="text-2xl font-bold">
                  ${reconciliation.total_monthly_cost.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">Monthly Cost</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center">
              <BarChart3 className="w-8 h-8 text-purple-500" />
              <div className="ml-3">
                <p className="text-2xl font-bold">{reconciliation.with_billing_data}</p>
                <p className="text-xs text-gray-500">With Billing</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center">
              <Wifi className="w-8 h-8 text-cyan-500" />
              <div className="ml-3">
                <p className="text-2xl font-bold">{reconciliation.with_mdm_status}</p>
                <p className="text-xs text-gray-500">MDM Tracked</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div className="ml-3">
                <p className="text-2xl font-bold">{reconciliation.by_condition?.Good || 0}</p>
                <p className="text-xs text-gray-500">Good Condition</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div className="ml-3">
                <p className="text-2xl font-bold">{reconciliation.by_condition?.Bad || 0}</p>
                <p className="text-xs text-gray-500">Bad Condition</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MDM Status Upload Section */}
      {showMdmUpload && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Upload MDM/SOTI Connection Status
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Upload a simple file from your SOTI or Power BI export with device connection status.
            This updates the MDM status for matching devices in the master database.
          </p>

          {uploadResult && (
            <div
              className={`mb-4 p-4 rounded-md flex items-start ${
                uploadResult.status === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {uploadResult.status === 'success' ? (
                <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
              )}
              <div>
                <p>{uploadResult.message}</p>
                {uploadResult.status === 'success' && uploadResult.stats && (
                  <div className="mt-2 text-sm grid grid-cols-2 gap-2">
                    <p>Total rows: {uploadResult.stats.total_rows}</p>
                    <p>Matched: {uploadResult.stats.matched}</p>
                    <p>Connected: {uploadResult.stats.connected}</p>
                    <p>Disconnected: {uploadResult.stats.disconnected}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Site (optional)
            </label>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="input max-w-xs"
            >
              <option value="">All Sites</option>
              {sites?.map((site) => (
                <option key={site.site_code} value={site.site_code}>
                  {site.site_code} - {site.site_name}
                </option>
              ))}
            </select>
          </div>

          {!mdmFile ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${
                isDragActive ? 'border-dhl-red bg-red-50' : 'border-gray-300'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 mx-auto text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Drop your MDM status file here or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Supports CSV or Excel with Serial Number and Status columns
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <FileSpreadsheet className="w-8 h-8 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium">{mdmFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(mdmFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setMdmFile(null)} className="btn-secondary">
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleMdmUpload}
                  disabled={mdmUploadMutation.isPending}
                  className="btn-primary"
                >
                  {mdmUploadMutation.isPending ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm">
            <p className="font-medium text-gray-700">Expected file format:</p>
            <div className="mt-2 font-mono text-xs bg-white p-3 rounded border overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pr-8 pb-1">Serial Number</th>
                    <th className="text-left pb-1">Status</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr>
                    <td className="pr-8">23055R0183</td>
                    <td>Connected in last 60 days</td>
                  </tr>
                  <tr>
                    <td className="pr-8">R52R504E3QA</td>
                    <td>Not Connected in last 60 days</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-gray-500">
              Status values: "Connected"/"Disconnected" or "Connected in last 60 days"/"Not Connected in last 60 days"
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by serial, model, or MAC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="input"
            >
              <option value="">All Sites</option>
              {sites?.map((site) => (
                <option key={site.site_code} value={site.site_code}>
                  {site.site_code} - {site.site_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red" />
          </div>
        ) : assets && assets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Serial Number
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Model
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Site
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Condition
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    MDM Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cost/Mo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assets.map((asset) => (
                  <tr key={asset.asset_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {asset.serial_number}
                      {asset.hsn && asset.hsn !== asset.serial_number && (
                        <span className="block text-xs text-gray-400">
                          HSN: {asset.hsn}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {asset.asset_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{asset.model}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {asset.assigned_site_code}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          asset.recorded_condition === 'Good'
                            ? 'bg-green-100 text-green-700'
                            : asset.recorded_condition === 'Bad'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {asset.recorded_condition || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {asset.mdm_enrollment_status === 'enrolled' ? (
                        asset.mdm_days_since_connect != null &&
                        asset.mdm_days_since_connect >= 60 ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-amber-100 text-amber-700">
                            <WifiOff className="w-3 h-3 mr-1" />
                            {asset.mdm_days_since_connect}d ago
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-700">
                            <Wifi className="w-3 h-3 mr-1" />
                            Connected
                          </span>
                        )
                      ) : asset.mdm_enrollment_status === 'not_enrolled' ? (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-600">
                          <WifiOff className="w-3 h-3 mr-1" />
                          Not Enrolled
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No MDM data</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {asset.cost_per_month
                        ? `$${Number(asset.cost_per_month).toFixed(2)}`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Database className="w-12 h-12 mx-auto text-gray-400" />
            <p className="mt-4 text-sm text-gray-500">
              {selectedSite
                ? 'No assets found for this site.'
                : 'Select a site to view assets.'}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Master data is built from IT Allocation uploads. Go to the IT Allocation page to upload billing data.
            </p>
          </div>
        )}
      </div>

      {/* Pagination info */}
      {assetsData && (
        <div className="text-sm text-gray-500 text-center">
          Showing {assets.length} of {assetsData.total} assets
        </div>
      )}
    </div>
  )
}
