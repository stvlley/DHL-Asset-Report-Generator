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
  Plus,
  Pencil,
  Trash2,
  Save,
} from 'lucide-react'
import type { Asset } from '../types'

interface AssetFormData {
  serial_number: string
  assigned_site_code: string
  asset_type: string
  model: string
  gl_string: string
  hsn?: string
  mac_address?: string
  recorded_condition?: string
  cost_per_month?: number
  notes?: string
}

const emptyAssetForm: AssetFormData = {
  serial_number: '',
  assigned_site_code: '',
  asset_type: '',
  model: '',
  gl_string: '',
  hsn: '',
  mac_address: '',
  recorded_condition: 'Good',
  cost_per_month: undefined,
  notes: '',
}

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

  // Asset CRUD state
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [assetForm, setAssetForm] = useState<AssetFormData>(emptyAssetForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

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

  // Asset CRUD mutations
  const createAssetMutation = useMutation({
    mutationFn: (data: AssetFormData) => assetManagementApi.create(data),
    onSuccess: () => {
      setShowAssetModal(false)
      setAssetForm(emptyAssetForm)
      queryClient.invalidateQueries({ queryKey: ['assets-managed'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation-summary'] })
    },
  })

  const updateAssetMutation = useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: Partial<AssetFormData> }) =>
      assetManagementApi.update(assetId, data),
    onSuccess: () => {
      setShowAssetModal(false)
      setEditingAsset(null)
      setAssetForm(emptyAssetForm)
      queryClient.invalidateQueries({ queryKey: ['assets-managed'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation-summary'] })
    },
  })

  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => assetManagementApi.delete(assetId),
    onSuccess: () => {
      setDeleteConfirm(null)
      queryClient.invalidateQueries({ queryKey: ['assets-managed'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation-summary'] })
    },
  })

  // Seed from IT Allocation
  const [seedResult, setSeedResult] = useState<{
    status: 'success' | 'error'
    message: string
    stats?: { created: number; updated: number; skipped: number }
  } | null>(null)

  const seedFromAllocationMutation = useMutation({
    mutationFn: ({ snapshotId, siteCode }: { snapshotId: string; siteCode?: string }) =>
      assetManagementApi.syncFromAllocation(snapshotId, siteCode),
    onSuccess: (result) => {
      setSeedResult({
        status: 'success',
        message: `Seeded ${result.created} new assets, updated ${result.updated}`,
        stats: { created: result.created, updated: result.updated, skipped: result.skipped },
      })
      queryClient.invalidateQueries({ queryKey: ['assets-managed'] })
      queryClient.invalidateQueries({ queryKey: ['reconciliation-summary'] })
    },
    onError: (error: Error) => {
      setSeedResult({
        status: 'error',
        message: error.message,
      })
    },
  })

  const handleSeedFromAllocation = () => {
    if (!snapshots || snapshots.length === 0) {
      setSeedResult({
        status: 'error',
        message: 'No IT Allocation snapshots available. Upload IT Allocation data first.',
      })
      return
    }
    const latestSnapshotId = snapshots[0].snapshot_id
    seedFromAllocationMutation.mutate({
      snapshotId: latestSnapshotId,
      siteCode: selectedSite || undefined,
    })
  }

  const handleOpenCreateModal = () => {
    setEditingAsset(null)
    setAssetForm({
      ...emptyAssetForm,
      assigned_site_code: selectedSite || '',
    })
    setShowAssetModal(true)
  }

  const handleOpenEditModal = (asset: Asset) => {
    setEditingAsset(asset)
    setAssetForm({
      serial_number: asset.serial_number,
      assigned_site_code: asset.assigned_site_code,
      asset_type: asset.asset_type,
      model: asset.model,
      gl_string: asset.gl_string,
      hsn: asset.hsn || '',
      mac_address: asset.mac_address || '',
      recorded_condition: asset.recorded_condition || 'Good',
      cost_per_month: asset.cost_per_month || undefined,
      notes: asset.notes || '',
    })
    setShowAssetModal(true)
  }

  const handleSaveAsset = () => {
    if (editingAsset) {
      updateAssetMutation.mutate({ assetId: editingAsset.asset_id, data: assetForm })
    } else {
      createAssetMutation.mutate(assetForm)
    }
  }

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
            onClick={handleSeedFromAllocation}
            disabled={seedFromAllocationMutation.isPending || !snapshots || snapshots.length === 0}
            className="btn-secondary"
            title="Sync assets from the latest IT Allocation upload"
          >
            <Database className="w-4 h-4 mr-2" />
            {seedFromAllocationMutation.isPending ? 'Seeding...' : 'Seed from IT Allocation'}
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Asset
          </button>
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

      {/* Seed Result Notification */}
      {seedResult && (
        <div
          className={`card p-4 ${
            seedResult.status === 'success'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {seedResult.status === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              )}
              <span
                className={
                  seedResult.status === 'success' ? 'text-green-700' : 'text-red-700'
                }
              >
                {seedResult.message}
              </span>
            </div>
            <button
              onClick={() => setSeedResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {seedResult.stats && (
            <div className="mt-2 text-sm text-green-600 flex gap-4">
              <span>Created: {seedResult.stats.created}</span>
              <span>Updated: {seedResult.stats.updated}</span>
              <span>Skipped: {seedResult.stats.skipped}</span>
            </div>
          )}
        </div>
      )}

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
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
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
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(asset)}
                          className="p-1 text-gray-400 hover:text-blue-600"
                          title="Edit asset"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(asset.asset_id)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Delete asset"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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

      {/* Asset Create/Edit Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-30" onClick={() => setShowAssetModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingAsset ? 'Edit Asset' : 'Add New Asset'}
                </h3>
                <button
                  onClick={() => setShowAssetModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Serial Number *
                    </label>
                    <input
                      type="text"
                      value={assetForm.serial_number}
                      onChange={(e) => setAssetForm({ ...assetForm, serial_number: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Site *
                    </label>
                    <select
                      value={assetForm.assigned_site_code}
                      onChange={(e) => setAssetForm({ ...assetForm, assigned_site_code: e.target.value })}
                      className="input"
                      required
                    >
                      <option value="">Select Site</option>
                      {sites?.map((site) => (
                        <option key={site.site_code} value={site.site_code}>
                          {site.site_code} - {site.site_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asset Type *
                    </label>
                    <select
                      value={assetForm.asset_type}
                      onChange={(e) => setAssetForm({ ...assetForm, asset_type: e.target.value })}
                      className="input"
                      required
                    >
                      <option value="">Select Type</option>
                      <option value="RF Scanner">RF Scanner</option>
                      <option value="Tablet">Tablet</option>
                      <option value="Printer">Printer</option>
                      <option value="Laptop">Laptop</option>
                      <option value="RF Software License">RF Software License</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model *
                    </label>
                    <input
                      type="text"
                      value={assetForm.model}
                      onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GL String *
                  </label>
                  <input
                    type="text"
                    value={assetForm.gl_string}
                    onChange={(e) => setAssetForm({ ...assetForm, gl_string: e.target.value })}
                    className="input"
                    placeholder="e.g., 0001-1234-5678-0000-0000"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      HSN
                    </label>
                    <input
                      type="text"
                      value={assetForm.hsn || ''}
                      onChange={(e) => setAssetForm({ ...assetForm, hsn: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      MAC Address
                    </label>
                    <input
                      type="text"
                      value={assetForm.mac_address || ''}
                      onChange={(e) => setAssetForm({ ...assetForm, mac_address: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Condition
                    </label>
                    <select
                      value={assetForm.recorded_condition || 'Good'}
                      onChange={(e) => setAssetForm({ ...assetForm, recorded_condition: e.target.value })}
                      className="input"
                    >
                      <option value="Good">Good</option>
                      <option value="Bad">Bad</option>
                      <option value="RMA">RMA</option>
                      <option value="Lost">Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cost/Month ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={assetForm.cost_per_month || ''}
                      onChange={(e) => setAssetForm({ ...assetForm, cost_per_month: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={assetForm.notes || ''}
                    onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })}
                    className="input"
                    rows={2}
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowAssetModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAsset}
                  disabled={createAssetMutation.isPending || updateAssetMutation.isPending || !assetForm.serial_number || !assetForm.assigned_site_code || !assetForm.asset_type || !assetForm.model || !assetForm.gl_string}
                  className="btn-primary"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingAsset ? 'Save Changes' : 'Create Asset'}
                </button>
              </div>

              {(createAssetMutation.isError || updateAssetMutation.isError) && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-sm">
                  {(createAssetMutation.error as Error)?.message || (updateAssetMutation.error as Error)?.message || 'An error occurred'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black opacity-30" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
              <div className="text-center">
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Delete Asset?
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  This will remove the asset from the master database. This action can be undone by re-importing from IT Allocation.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteAssetMutation.mutate(deleteConfirm)}
                    disabled={deleteAssetMutation.isPending}
                    className="btn-primary bg-red-600 hover:bg-red-700"
                  >
                    {deleteAssetMutation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
