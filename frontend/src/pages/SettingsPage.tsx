/**
 * Settings Page - Admin configuration for the application.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appSettingsApi, settingsApi, reportsApi } from '../services/api'
import { usePermissions } from '../hooks/usePermissions'
import {
  Settings,
  Clock,
  Mail,
  Server,
  Save,
  TestTube,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'

export default function SettingsPage() {
  const { isAdmin } = usePermissions()
  const queryClient = useQueryClient()

  const [inactiveThreshold, setInactiveThreshold] = useState<number | ''>('')
  const [testEmail, setTestEmail] = useState('')
  const [sotiConfig, setSotiConfig] = useState({
    base_url: '',
    client_id: '',
    client_secret: '',
    username: '',
    password: '',
  })

  // Fetch current settings
  const { data: thresholdData, isLoading: loadingThreshold } = useQuery({
    queryKey: ['settings', 'inactive-threshold'],
    queryFn: appSettingsApi.getInactiveThreshold,
    enabled: isAdmin,
  })

  const { data: allSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ['settings', 'all'],
    queryFn: appSettingsApi.getAllSettings,
    enabled: isAdmin,
  })

  const { data: emailStatus } = useQuery({
    queryKey: ['settings', 'email-status'],
    queryFn: reportsApi.getEmailStatus,
    enabled: isAdmin,
  })

  const { data: sotiStatus, refetch: refetchSoti } = useQuery({
    queryKey: ['settings', 'soti-status'],
    queryFn: settingsApi.getSotiStatus,
    enabled: isAdmin,
  })

  // Update inactive threshold mutation
  const updateThresholdMutation = useMutation({
    mutationFn: (days: number) => appSettingsApi.setInactiveThreshold(days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setInactiveThreshold('')
    },
  })

  // Configure SOTI mutation
  const configureSotiMutation = useMutation({
    mutationFn: () => settingsApi.configureSoti(sotiConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'soti-status'] })
      setSotiConfig({
        base_url: '',
        client_id: '',
        client_secret: '',
        username: '',
        password: '',
      })
    },
  })

  // Test SOTI connection mutation
  const testSotiMutation = useMutation({
    mutationFn: settingsApi.testSotiConnection,
  })

  // Send test email mutation
  const testEmailMutation = useMutation({
    mutationFn: (recipient: string) => reportsApi.sendTestEmail(recipient),
    onSuccess: () => {
      setTestEmail('')
    },
  })

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600 mt-2">You need admin privileges to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Configure application settings and integrations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inactive Threshold Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Inactive Device Threshold</h2>
              <p className="text-sm text-gray-500">
                Days since last MDM connection to mark as inactive
              </p>
            </div>
          </div>

          {loadingThreshold ? (
            <div className="animate-pulse h-10 bg-gray-100 rounded" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current: {thresholdData?.inactive_threshold_days || 60} days
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={inactiveThreshold}
                    onChange={(e) =>
                      setInactiveThreshold(e.target.value ? parseInt(e.target.value) : '')
                    }
                    placeholder="New threshold (days)"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                  />
                </div>
                <button
                  onClick={() =>
                    inactiveThreshold && updateThresholdMutation.mutate(inactiveThreshold)
                  }
                  disabled={!inactiveThreshold || updateThresholdMutation.isPending}
                  className="mt-6 px-4 py-2 bg-dhl-red text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
              </div>
              {updateThresholdMutation.isSuccess && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Threshold updated successfully
                </p>
              )}
            </div>
          )}
        </div>

        {/* Email Configuration */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Mail className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Email Configuration</h2>
              <p className="text-sm text-gray-500">Configure email for sending reports</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Status:</span>
              {emailStatus?.configured ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Configured ({emailStatus.from_email})
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  Not configured
                </span>
              )}
            </div>

            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Send Test Email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                />
                <button
                  onClick={() => testEmail && testEmailMutation.mutate(testEmail)}
                  disabled={!testEmail || testEmailMutation.isPending || !emailStatus?.configured}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <TestTube className="h-4 w-4" />
                  Test
                </button>
              </div>
              {testEmailMutation.isSuccess && (
                <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Test email sent successfully
                </p>
              )}
              {testEmailMutation.isError && (
                <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Failed to send test email
                </p>
              )}
            </div>
          </div>
        </div>

        {/* SOTI/MDM Integration */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Server className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">SOTI MDM Integration</h2>
                <p className="text-sm text-gray-500">Connect to SOTI for device management data</p>
              </div>
            </div>
            <button
              onClick={() => refetchSoti()}
              className="text-gray-400 hover:text-gray-600"
              title="Refresh status"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Status:</span>
              {sotiStatus?.configured ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Connected to {sotiStatus.base_url}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  {sotiStatus?.message || 'Not configured'}
                </span>
              )}
            </div>

            {sotiStatus?.configured && (
              <button
                onClick={() => testSotiMutation.mutate()}
                disabled={testSotiMutation.isPending}
                className="px-4 py-2 border border-purple-600 text-purple-600 rounded-md hover:bg-purple-50 disabled:opacity-50 flex items-center gap-2"
              >
                <TestTube className="h-4 w-4" />
                {testSotiMutation.isPending ? 'Testing...' : 'Test Connection'}
              </button>
            )}

            {testSotiMutation.isSuccess && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Connection successful - Found {testSotiMutation.data?.device_count || 0} devices
              </p>
            )}

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Configure SOTI Connection</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                  <input
                    type="url"
                    value={sotiConfig.base_url}
                    onChange={(e) => setSotiConfig({ ...sotiConfig, base_url: e.target.value })}
                    placeholder="https://soti.company.com"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                  <input
                    type="text"
                    value={sotiConfig.client_id}
                    onChange={(e) => setSotiConfig({ ...sotiConfig, client_id: e.target.value })}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Secret
                  </label>
                  <input
                    type="password"
                    value={sotiConfig.client_secret}
                    onChange={(e) =>
                      setSotiConfig({ ...sotiConfig, client_secret: e.target.value })
                    }
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={sotiConfig.username}
                    onChange={(e) => setSotiConfig({ ...sotiConfig, username: e.target.value })}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={sotiConfig.password}
                    onChange={(e) => setSotiConfig({ ...sotiConfig, password: e.target.value })}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                  />
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => configureSotiMutation.mutate()}
                  disabled={
                    !sotiConfig.base_url ||
                    !sotiConfig.client_id ||
                    !sotiConfig.client_secret ||
                    configureSotiMutation.isPending
                  }
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {configureSotiMutation.isPending ? 'Saving...' : 'Save SOTI Configuration'}
                </button>
                {configureSotiMutation.isSuccess && (
                  <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Configuration saved successfully
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* All Settings Overview */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Settings className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">All Settings</h2>
              <p className="text-sm text-gray-500">Overview of all application settings</p>
            </div>
          </div>

          {loadingSettings ? (
            <div className="animate-pulse space-y-2">
              <div className="h-8 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
              <div className="h-8 bg-gray-100 rounded" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Setting
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Value
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Description
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Last Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allSettings?.settings?.map((setting) => (
                    <tr key={setting.key} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">
                        {setting.key}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {typeof setting.value === 'object'
                          ? JSON.stringify(setting.value)
                          : String(setting.value)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {setting.description || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {setting.updated_at
                          ? new Date(setting.updated_at).toLocaleDateString()
                          : 'Default'}
                      </td>
                    </tr>
                  ))}
                  {(!allSettings?.settings || allSettings.settings.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-sm text-gray-500 text-center">
                        No settings found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
