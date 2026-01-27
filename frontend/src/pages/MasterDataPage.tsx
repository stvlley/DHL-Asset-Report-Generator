import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { assetsApi, sitesApi } from '../services/api'
import {
  Database,
  Upload,
  Download,
  Search,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
} from 'lucide-react'

export default function MasterDataPage() {
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    status: 'success' | 'error'
    message: string
    created?: number
    updated?: number
  } | null>(null)
  const queryClient = useQueryClient()

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  const { data: assets, isLoading } = useQuery({
    queryKey: ['assets', selectedSite],
    queryFn: () => assetsApi.list({ site_code: selectedSite || undefined, limit: 100 }),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => assetsApi.bulkUpload(file),
    onSuccess: (result) => {
      setUploadResult({
        status: 'success',
        message: `Upload complete: ${result.created} created, ${result.updated} updated`,
        created: result.created,
        updated: result.updated,
      })
      setUploadFile(null)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
    onError: () => {
      setUploadResult({
        status: 'error',
        message: 'Upload failed. Please check file format.',
      })
    },
  })

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setUploadFile(acceptedFiles[0])
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

  const handleUpload = () => {
    if (uploadFile) {
      uploadMutation.mutate(uploadFile)
    }
  }

  const filteredAssets = assets?.filter(
    (asset) =>
      asset.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.asset_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.model.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master Data</h1>
          <p className="text-sm text-gray-500 mt-1">
            View and manage the corporate asset database
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={assetsApi.exportUrl(selectedSite || undefined)}
            className="btn-secondary"
            download
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </a>
          <button onClick={() => setShowUpload(!showUpload)} className="btn-primary">
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </button>
        </div>
      </div>

      {/* Upload Section */}
      {showUpload && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Bulk Upload Master Data
          </h2>

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
              {uploadResult.message}
            </div>
          )}

          {!uploadFile ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${
                isDragActive ? 'border-dhl-red bg-red-50' : 'border-gray-300'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 mx-auto text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Drop Excel/CSV file here or click to browse
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <FileSpreadsheet className="w-8 h-8 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium">{uploadFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(uploadFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setUploadFile(null)} className="btn-secondary">
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending}
                  className="btn-primary"
                >
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-medium">Required columns:</p>
            <p>serial_number, asset_type, model, assigned_site_code, gl_string</p>
            <p className="mt-1">
              Optional: acquisition_date, recorded_condition, cost_per_month
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
                placeholder="Search by serial, type, or model..."
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
        ) : filteredAssets && filteredAssets.length > 0 ? (
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
                    GL String
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Condition
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cost/Mo
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAssets.map((asset) => (
                  <tr key={asset.asset_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {asset.serial_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {asset.asset_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{asset.model}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {asset.assigned_site_code}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {asset.gl_string}
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
                    <td className="px-4 py-3 text-sm text-gray-500">
                      ${asset.cost_per_month || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Database className="w-12 h-12 mx-auto text-gray-400" />
            <p className="mt-4 text-sm text-gray-500">No assets found</p>
          </div>
        )}
      </div>
    </div>
  )
}
