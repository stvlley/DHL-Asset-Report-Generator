import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../hooks/useAuthStore'
import type {
  AuthTokens,
  User,
  Site,
  Asset,
  Audit,
  AuditDetail,
  Variance,
  ExecutiveSummary,
  ActionList,
  PortfolioSummary,
  TrendData,
} from '../types'

const API_BASE_URL = '/api/v1'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const tokens = useAuthStore.getState().tokens
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`
  }
  return config
})

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const tokens = useAuthStore.getState().tokens
        if (tokens?.refresh_token) {
          const response = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: tokens.refresh_token,
          })

          useAuthStore.getState().updateTokens(response.data)
          originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`

          return api(originalRequest)
        }
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: async (email: string, password: string): Promise<AuthTokens> => {
    const formData = new FormData()
    formData.append('username', email)
    formData.append('password', password)

    const response = await api.post<AuthTokens>('/auth/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  getMe: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me')
    return response.data
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout')
  },

  requestPasswordReset: async (email: string): Promise<void> => {
    await api.post('/auth/password-reset/request', { email })
  },
}

// Sites API
export const sitesApi = {
  list: async (params?: { account_name?: string; region?: string }): Promise<Site[]> => {
    const response = await api.get<Site[]>('/sites', { params })
    return response.data
  },

  get: async (siteCode: string): Promise<Site> => {
    const response = await api.get<Site>(`/sites/${siteCode}`)
    return response.data
  },

  create: async (site: Omit<Site, 'created_at' | 'is_active'>): Promise<Site> => {
    const response = await api.post<Site>('/sites', site)
    return response.data
  },
}

// Master Data API
export const assetsApi = {
  list: async (params?: {
    site_code?: string
    asset_type?: string
    limit?: number
    offset?: number
  }): Promise<Asset[]> => {
    const response = await api.get<Asset[]>('/master-data/assets', { params })
    return response.data
  },

  bulkUpload: async (file: File): Promise<{
    total_records: number
    created: number
    updated: number
    errors: { row: number; field: string; message: string }[]
    warnings: { row: number; field: string; message: string }[]
  }> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post('/master-data/assets/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  exportUrl: (siteCode?: string): string => {
    const params = siteCode ? `?site_code=${siteCode}` : ''
    return `${API_BASE_URL}/master-data/assets/export${params}`
  },
}

// Audits API
export const auditsApi = {
  list: async (params?: {
    site_code?: string
    limit?: number
    offset?: number
  }): Promise<Audit[]> => {
    const response = await api.get<Audit[]>('/audits', { params })
    return response.data
  },

  get: async (auditId: string): Promise<Audit> => {
    const response = await api.get<Audit>(`/audits/${auditId}`)
    return response.data
  },

  getDetails: async (auditId: string): Promise<AuditDetail[]> => {
    const response = await api.get<AuditDetail[]>(`/audits/${auditId}/details`)
    return response.data
  },

  upload: async (
    file: File,
    siteCode: string,
    auditDate: string,
    auditorName: string
  ): Promise<{
    status: string
    audit_id: string | null
    message: string
    total_assets: number
    processing_status: string
    validation_errors: { row: number; field: string; message: string }[]
    warnings: { row: number; field: string; message: string }[]
  }> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('site_code', siteCode)
    formData.append('audit_date', auditDate)
    formData.append('auditor_name', auditorName)

    const response = await api.post('/audits/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  uploadMdm: async (
    auditId: string,
    file: File
  ): Promise<{ status: string; snapshot_id: string; total_records: number }> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post(`/audits/${auditId}/mdm-upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  getExecutiveSummary: async (auditId: string): Promise<ExecutiveSummary> => {
    const response = await api.get<ExecutiveSummary>(
      `/audits/${auditId}/reports/executive-summary`
    )
    return response.data
  },

  getActionList: async (auditId: string): Promise<ActionList> => {
    const response = await api.get<ActionList>(`/audits/${auditId}/reports/action-list`)
    return response.data
  },

  exportExcelUrl: (auditId: string): string => {
    return `${API_BASE_URL}/audits/${auditId}/reports/export-excel`
  },
}

// Variances API
export const variancesApi = {
  list: async (
    auditId: string,
    params?: {
      variance_type?: string
      priority?: string
      status?: string
      limit?: number
      offset?: number
    }
  ): Promise<Variance[]> => {
    const response = await api.get<Variance[]>(`/variances/audit/${auditId}/variances`, {
      params,
    })
    return response.data
  },

  getSummary: async (
    auditId: string
  ): Promise<{
    audit_id: string
    site_code: string
    audit_date: string
    summary: {
      total_variances: number
      by_type: Record<string, number>
      by_priority: Record<string, number>
      financial_impact: {
        potential_monthly_savings: number
        assets_to_remove_count: number
        assets_to_transfer_count: number
        assets_to_add_count: number
      }
      gl_accuracy: {
        assets_in_gl: number
        correct: number
        accuracy_percentage: number
      }
    }
  }> => {
    const response = await api.get(`/variances/audit/${auditId}/variances/summary`)
    return response.data
  },

  updateStatus: async (
    varianceId: string,
    data: { status: string; resolution_notes?: string; assigned_to?: string }
  ): Promise<Variance> => {
    const response = await api.patch<Variance>(`/variances/${varianceId}/status`, data)
    return response.data
  },

  getEmailTemplate: async (varianceId: string): Promise<{ variance_id: string; email_template: string }> => {
    const response = await api.get(`/variances/${varianceId}/email-template`)
    return response.data
  },
}

// Dashboard API
export const dashboardApi = {
  getPortfolioSummary: async (params?: {
    account_name?: string
    region?: string
  }): Promise<PortfolioSummary> => {
    const response = await api.get<PortfolioSummary>('/dashboard/portfolio-summary', {
      params,
    })
    return response.data
  },

  getSiteMetrics: async (siteCode: string): Promise<Record<string, unknown>> => {
    const response = await api.get(`/dashboard/site-metrics/${siteCode}`)
    return response.data
  },

  getTrends: async (params?: {
    site_code?: string
    months?: number
  }): Promise<{ site_code: string | null; trends: TrendData[] }> => {
    const response = await api.get('/dashboard/trends', { params })
    return response.data
  },
}

export default api
