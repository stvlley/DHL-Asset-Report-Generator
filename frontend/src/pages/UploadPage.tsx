import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { sitesApi, auditsApi } from '../services/api'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react'

const uploadSchema = z.object({
  site_code: z.string().min(1, 'Please select a site'),
  audit_date: z.string().min(1, 'Please select a date'),
  auditor_name: z.string().min(1, 'Please enter auditor name'),
})

type UploadForm = z.infer<typeof uploadSchema>

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    status: string
    audit_id?: string | null
    message?: string
    validation_errors?: { row: number; field: string; message: string }[]
    warnings?: { row: number; field: string; message: string }[]
  } | null>(null)
  const navigate = useNavigate()

  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      audit_date: new Date().toISOString().split('T')[0],
    },
  })

  const uploadMutation = useMutation({
    mutationFn: (data: UploadForm & { file: File }) =>
      auditsApi.upload(data.file, data.site_code, data.audit_date, data.auditor_name),
    onSuccess: (result) => {
      setUploadResult(result)
      if (result.status === 'success' && result.audit_id) {
        // Navigate to audit detail after brief delay
        setTimeout(() => {
          navigate(`/audits/${result.audit_id}`)
        }, 2000)
      }
    },
    onError: (error: { response?: { data?: { detail?: string | { message?: string; errors?: { row: number; field: string; message: string }[] } } } }) => {
      const detail = error.response?.data?.detail
      if (typeof detail === 'object' && detail.errors) {
        setUploadResult({
          status: 'error',
          message: detail.message || 'Validation failed',
          validation_errors: detail.errors,
        })
      } else {
        setUploadResult({
          status: 'error',
          message: typeof detail === 'string' ? detail : 'Upload failed. Please try again.',
        })
      }
    },
  })

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
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

  const onSubmit = (data: UploadForm) => {
    if (!file) {
      return
    }
    uploadMutation.mutate({ ...data, file })
  }

  const removeFile = () => {
    setFile(null)
    setUploadResult(null)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Physical Audit</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload your monthly physical audit Excel file for reconciliation
        </p>
      </div>

      {/* Success Message */}
      {uploadResult?.status === 'success' && (
        <div className="card p-6 border-green-200 bg-green-50">
          <div className="flex items-start">
            <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
            <div className="ml-3">
              <h3 className="text-lg font-medium text-green-800">
                Audit Uploaded Successfully!
              </h3>
              <p className="mt-1 text-sm text-green-700">
                {uploadResult.message}
              </p>
              {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-yellow-700">
                    Warnings ({uploadResult.warnings.length}):
                  </p>
                  <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                    {uploadResult.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 text-sm text-green-700">
                Redirecting to audit results...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {uploadResult?.status === 'error' && (
        <div className="card p-6 border-red-200 bg-red-50">
          <div className="flex items-start">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-red-800">
                Upload Failed
              </h3>
              <p className="mt-1 text-sm text-red-700">
                {uploadResult.message}
              </p>
              {uploadResult.validation_errors && uploadResult.validation_errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-red-700">
                    Validation Errors ({uploadResult.validation_errors.length}):
                  </p>
                  <ul className="mt-2 space-y-1">
                    {uploadResult.validation_errors.slice(0, 10).map((err, i) => (
                      <li
                        key={i}
                        className="text-sm text-red-700 bg-red-100 px-2 py-1 rounded"
                      >
                        Row {err.row}: {err.field} - {err.message}
                      </li>
                    ))}
                    {uploadResult.validation_errors.length > 10 && (
                      <li className="text-sm text-red-600 italic">
                        ...and {uploadResult.validation_errors.length - 10} more errors
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Form */}
      {uploadResult?.status !== 'success' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Site Information */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Step 1: Site Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Site</label>
                <select
                  {...register('site_code')}
                  className={`input ${errors.site_code ? 'border-red-500' : ''}`}
                  disabled={sitesLoading}
                >
                  <option value="">Select a site...</option>
                  {sites?.map((site) => (
                    <option key={site.site_code} value={site.site_code}>
                      {site.site_code} - {site.site_name}
                    </option>
                  ))}
                </select>
                {errors.site_code && (
                  <p className="mt-1 text-sm text-red-600">{errors.site_code.message}</p>
                )}
              </div>

              <div>
                <label className="label">Audit Date</label>
                <input
                  {...register('audit_date')}
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  className={`input ${errors.audit_date ? 'border-red-500' : ''}`}
                />
                {errors.audit_date && (
                  <p className="mt-1 text-sm text-red-600">{errors.audit_date.message}</p>
                )}
              </div>

              <div>
                <label className="label">Auditor Name</label>
                <input
                  {...register('auditor_name')}
                  type="text"
                  placeholder="Enter your name"
                  className={`input ${errors.auditor_name ? 'border-red-500' : ''}`}
                />
                {errors.auditor_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.auditor_name.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Step 2: Upload Physical Audit File
            </h2>

            {!file ? (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-dhl-red bg-red-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-12 h-12 mx-auto text-gray-400" />
                <p className="mt-4 text-sm text-gray-600">
                  {isDragActive
                    ? 'Drop the file here...'
                    : 'Drag & drop your Excel file here, or click to browse'}
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Supported formats: .xlsx, .xls, .csv
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <FileSpreadsheet className="w-8 h-8 text-green-500" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeFile}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-800">Required Columns:</p>
              <ul className="mt-1 text-sm text-blue-700 list-disc list-inside">
                <li>Serial Number</li>
                <li>Asset Type</li>
                <li>Model</li>
                <li>Condition (Good, Bad, RMA, or Lost)</li>
              </ul>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/audits')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || uploadMutation.isPending}
              className="btn-primary"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Process
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
