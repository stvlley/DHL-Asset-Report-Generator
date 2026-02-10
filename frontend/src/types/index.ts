// User types
export interface User {
  user_id: string
  email: string
  full_name: string | null
  role: UserRole
  assigned_sites: string[]
  assigned_region: string | null
  is_active: boolean
  created_at: string
  last_login: string | null
}

// Primary roles
export type UserRole = 'admin' | 'super_user' | 'auditor' |
  // Deprecated roles (kept for backward compatibility)
  'site_operations' | 'site_manager' | 'regional_director'

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

// Site types
export interface Site {
  site_code: string
  site_name: string
  account_name: string
  region: string | null
  address: string | null
  primary_contact: string | null
  is_active: boolean
  created_at: string
}

// Asset types
export interface Asset {
  asset_id: string
  serial_number: string
  asset_type: string
  model: string
  assigned_site_code: string
  gl_string: string
  acquisition_date: string | null
  recorded_condition: string | null
  cost_per_month: number | null
  created_at: string
  updated_at: string
  // Additional fields from master data
  hsn?: string | null
  mac_address?: string | null
  imei?: string | null
  manufacturer?: string | null
  mdm_device_id?: string | null
  mdm_enrollment_status?: string | null
  mdm_last_seen?: string | null
  mdm_last_sync?: string | null
  mdm_days_since_connect?: number | null
  mdm_os_version?: string | null
  mdm_device_name?: string | null
  source?: string | null
  notes?: string | null
  is_deleted?: boolean
}

// Audit types
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'completed_with_warnings' | 'error'

export interface Audit {
  audit_id: string
  site_code: string
  audit_date: string
  auditor_name: string
  upload_timestamp: string
  file_name: string | null
  total_assets_found: number
  processing_status: ProcessingStatus
  error_message: string | null
  warning_count: number
}

export interface AuditDetail {
  detail_id: number
  row_number: number | null
  serial_number: string
  asset_type: string
  model: string
  physical_condition: string
  location_notes: string | null
  is_duplicate: boolean
  duplicate_of_row: number | null
}

// Variance types
export type VarianceType =
  | 'CORRECT'
  | 'MISALLOCATED'
  | 'UNTRACKED'
  | 'MISSING'
  | 'CONDITION_MISMATCH'
  | 'MDM_NOT_ENROLLED'
  | 'MDM_INACTIVE_WARNING'
  | 'DUPLICATE_IN_AUDIT'
  | 'GL_MISMATCH'
  | 'NOT_IN_ALLOCATION'

export type PriorityLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface Variance {
  variance_id: string
  audit_id: string
  serial_number: string | null
  variance_type: VarianceType
  priority: PriorityLevel
  description: string | null
  current_gl_site: string | null
  physical_site: string | null
  expected_site_code: string | null
  gl_string: string | null
  master_condition: string | null
  physical_condition: string | null
  asset_type: string | null
  model: string | null
  monthly_cost_impact: number
  action_required: string | null
  recommended_action: string | null
  email_template: string | null
  status: string
  assigned_to: string | null
  resolution_notes: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

// Report types
export interface ExecutiveSummary {
  header: {
    title: string
    site_code: string
    site_name: string
    account_name: string
    audit_date: string
    auditor: string
    generated_at: string
  }
  physical_results: {
    total_found: number
    good: number
    bad: number
    rma: number
    lost: number
  }
  gl_reconciliation: {
    assets_in_gl: number
    correct: number
    missing: number
    misallocated: number
    untracked: number
    condition_mismatch: number
  }
  metrics: {
    gl_accuracy_pct: number
    potential_monthly_savings: number
    potential_annual_savings: number
  }
  action_items: {
    high_priority: number
    medium_priority: number
    low_priority: number
  }
  trend: number | null
}

export interface ActionList {
  removal: ActionCategory
  transfer: ActionCategory
  addition: ActionCategory
  condition: ActionCategory
  mdm: ActionCategory
}

export interface ActionCategory {
  title: string
  description: string
  count: number
  total_monthly_savings?: number
  items: ActionItem[]
}

export interface ActionItem {
  variance_id: string
  serial_number: string | null
  asset_type: string | null
  model: string | null
  priority: PriorityLevel | null
  current_gl_site: string | null
  physical_site: string | null
  master_condition: string | null
  physical_condition: string | null
  monthly_cost_impact: number | null
  action_required: string | null
  email_template: string | null
  status: ActionStatus | null
}

// Dashboard types
export interface PortfolioSummary {
  total_sites: number
  total_assets_in_gl: number
  total_gl_accuracy_pct: number | null
  total_potential_savings: number
  sites_with_overdue_audits: number
  high_priority_items: number
  site_details: SiteDetail[]
}

export interface SiteDetail {
  site_code: string
  site_name: string
  account_name: string
  region: string | null
  audit_date: string | null
  days_since_audit: number | null
  total_assets_found: number | null
  assets_in_gl: number
  gl_accuracy_pct: number | null
  potential_monthly_savings: number
  high_priority_items: number
  is_overdue: boolean
}

export interface TrendData {
  month: string
  gl_accuracy_pct: number | null
  potential_savings: number
  total_assets: number
}

// IT Allocation types
export interface ITAllocationSnapshot {
  snapshot_id: string
  upload_timestamp: string
  period: number
  year: number
  file_name: string | null
  total_records: number
  rf_hardware_count: number
  rf_software_count: number
  uploaded_by: string | null
}

export interface ITAllocationDevice {
  device_id: number
  snapshot_id: string
  hsn: string | null
  mac_address: string | null
  device_model: string | null
  gl_string: string
  category: string
  amount: number
  gl_company: string | null
  gl_cost_center: string | null
  gl_cost_unit: string | null
  gl_account: string | null
  gl_activity: string | null
  gl_sub_account: string | null
}

export interface ITAllocationUploadResponse {
  status: string
  snapshot_id: string
  message: string
  total_records: number
  rf_hardware_count: number
  rf_software_count: number
  unique_devices: number
  unique_gl_strings: number
  parsing_errors: { row?: number; error: string }[]
}

export interface DeviceLookupResponse {
  found: boolean
  hsn: string | null
  mac_address: string | null
  device_model: string | null
  gl_string: string | null
  category: string | null
  amount: number | null
  snapshot_period: string | null
}

export interface GLStringSummary {
  gl_string: string
  category: string
  device_count: number
  total_amount: number
}

export interface SiteGLMapping {
  mapping_id: number
  site_code: string
  gl_string: string
  category: string | null
  is_primary: number
  notes: string | null
  created_at: string
  updated_at: string
}

// KLS Dashboard Types (4-KPI format)
export interface KLSDashboardKPIs {
  site_code: string
  site_name: string
  audit_date: string | null
  auditor: string | null
  audit_period: string
  report_generated: string

  // KPI 1: On-Site Total
  on_site_total: number
  good_count: number
  bad_count: number
  rma_count: number
  lost_count: number

  // KPI 2: IT Allocation Variance
  it_allocation_total: number
  it_allocation_variance: number
  it_allocation_variance_comment: string | null

  // KPI 3: PBI/SOTI Variance
  pbi_total: number
  pbi_variance: number
  pbi_variance_comment: string | null
  pbi_connected: number
  pbi_disconnected: number

  // KPI 4: Inactive Devices
  inactive_threshold_days: number
  inactive_device_count: number

  // Asset inventory breakdown
  inventory_by_type: AssetInventoryByType[]

  // Workflow status
  workflow: WorkflowStatus

  // Data freshness
  it_allocation_snapshot: string | null
  pbi_snapshot: string | null
}

export interface AssetInventoryByType {
  device_type: string
  prior_count: number
  good: number
  bad: number
  rma: number
  lost: number
  pbi_total: number
  pbi_report_diff: number
  current_count: number
  change: number
}

export interface WorkflowStatus {
  audit_due_date: string
  internal_review_due: string
  report_deadline: string
  audit_completed: boolean
  review_completed: boolean
  report_sent: boolean
  days_until_due: number
}

export interface KLSPortfolioSummary {
  generated_at: string
  totals: {
    on_site_total: number
    it_allocation_total: number
    pbi_total: number
    inactive_count: number
    sites_count: number
  }
  it_allocation_variance: number
  pbi_variance: number
  sites: KLSDashboardKPIs[]
}

// PBI/SOTI Types
export interface PBISnapshot {
  snapshot_id: string
  site_code: string
  period: number
  year: number
  upload_timestamp: string | null
  file_name: string | null
  total_records: number
  connected_count: number
  disconnected_count: number
  inactive_threshold_days: number
}

export interface PBIDevice {
  device_id: number
  serial_number: string
  model: string | null
  connection_status: string | null
  days_since_connect: number | null
  justification: string | null
  ticket_number: string | null
  justification_date: string | null
}

export interface PBIConnectionSummary {
  site_code: string
  has_data: boolean
  total: number
  connected: number
  disconnected: number
  inactive_threshold_days: number
  snapshot_date: string | null
  snapshot_id?: string
  period?: string
}

export interface PBIUploadResponse {
  status: string
  snapshot_id?: string
  message: string
  total_records: number
  connected_count: number
  disconnected_count: number
  inactive_threshold_days: number
  errors: { row?: number; error: string }[]
}

// Report Recipients
export interface ReportRecipients {
  site_code: string
  director_email: string | null
  gm_emails: string | null
  report_recipients: string | null
  all_recipients: string[]
}
