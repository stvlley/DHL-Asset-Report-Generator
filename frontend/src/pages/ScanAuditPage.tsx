import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { scanAuditApi, sitesApi } from '../services/api'
import {
  Scan,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Square,
  Search,
  List,
  AlertCircle,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Package,
} from 'lucide-react'

type TabType = 'scan' | 'progress' | 'scanned' | 'missing'

export default function ScanAuditPage() {
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [scanInput, setScanInput] = useState('')
  const [lookupResult, setLookupResult] = useState<Record<string, unknown> | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('scan')
  const [showHistory, setShowHistory] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  const { data: activeSession, refetch: refetchSession } = useQuery({
    queryKey: ['active-scan-session', selectedSite],
    queryFn: () => scanAuditApi.getActiveSession(selectedSite),
    enabled: !!selectedSite,
  })

  const { data: sessionStats, refetch: refetchStats } = useQuery({
    queryKey: ['scan-session-stats', sessionId],
    queryFn: () => scanAuditApi.getSessionStats(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 5000,
  })

  const { data: scannedItems, refetch: refetchScanned } = useQuery({
    queryKey: ['scanned-items', sessionId],
    queryFn: () => scanAuditApi.getScannedItems(sessionId!, 50, 0),
    enabled: !!sessionId && activeTab === 'scanned',
  })

  const { data: missingAssets, refetch: refetchMissing } = useQuery({
    queryKey: ['missing-assets', sessionId],
    queryFn: () => scanAuditApi.getMissingAssets(sessionId!, 100, 0),
    enabled: !!sessionId && activeTab === 'missing',
  })

  const { data: modelBreakdown, refetch: refetchModelBreakdown } = useQuery({
    queryKey: ['model-breakdown', sessionId],
    queryFn: () => scanAuditApi.getModelBreakdown(sessionId!),
    enabled: !!sessionId && activeTab === 'progress',
    refetchInterval: activeTab === 'progress' ? 5000 : false,
  })

  const { data: sessionHistory } = useQuery({
    queryKey: ['session-history', selectedSite],
    queryFn: () => scanAuditApi.getSessionHistory(selectedSite, 5),
    enabled: !!selectedSite && showHistory,
  })

  // Set session ID when active session is found
  useEffect(() => {
    if (activeSession?.active && activeSession.session) {
      setSessionId(activeSession.session.session_id)
    }
  }, [activeSession])

  // Focus scan input when session is active
  useEffect(() => {
    if (sessionId && scanInputRef.current) {
      scanInputRef.current.focus()
    }
  }, [sessionId, activeTab])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!sessionId || !lookupResult) return

      // G for Good, B for Bad
      if (e.key.toLowerCase() === 'g' && lookupResult.status !== 'duplicate') {
        e.preventDefault()
        handleRecordCondition('G')
      } else if (e.key.toLowerCase() === 'b' && lookupResult.status !== 'duplicate') {
        e.preventDefault()
        handleRecordCondition('B')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sessionId, lookupResult])

  const startSessionMutation = useMutation({
    mutationFn: (data: { site_code: string; session_name?: string }) =>
      scanAuditApi.startSession(data),
    onSuccess: (result) => {
      setSessionId(result.session_id)
      refetchSession()
    },
  })

  const endSessionMutation = useMutation({
    mutationFn: (sessionId: string) => scanAuditApi.endSession(sessionId),
    onSuccess: () => {
      setSessionId(null)
      setLookupResult(null)
      refetchSession()
    },
  })

  const lookupMutation = useMutation({
    mutationFn: ({ sessionId, value }: { sessionId: string; value: string }) =>
      scanAuditApi.lookup(sessionId, value),
    onSuccess: (result) => {
      setLookupResult(result)
    },
  })

  const recordMutation = useMutation({
    mutationFn: ({
      sessionId,
      data,
    }: {
      sessionId: string
      data: { scanned_value: string; condition: string }
    }) => scanAuditApi.recordScan(sessionId, data),
    onSuccess: () => {
      setLookupResult(null)
      setScanInput('')
      refetchStats()
      refetchScanned()
      refetchMissing()
      refetchModelBreakdown()
      scanInputRef.current?.focus()
    },
  })

  const handleScan = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!sessionId || !scanInput.trim()) return

      lookupMutation.mutate({ sessionId, value: scanInput.trim() })
    },
    [sessionId, scanInput, lookupMutation]
  )

  const handleRecordCondition = useCallback(
    (condition: string) => {
      if (!sessionId || !scanInput.trim()) return

      recordMutation.mutate({
        sessionId,
        data: {
          scanned_value: scanInput.trim(),
          condition,
        },
      })
    },
    [sessionId, scanInput, recordMutation]
  )

  const handleStartSession = () => {
    if (!selectedSite) return
    startSessionMutation.mutate({ site_code: selectedSite })
  }

  const handleEndSession = () => {
    if (!sessionId) return
    if (confirm('Are you sure you want to end this scan session?')) {
      endSessionMutation.mutate(sessionId)
    }
  }

  const stats = sessionStats || activeSession?.session

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scan Audit</h1>
          <p className="text-sm text-gray-500 mt-1">
            Physical inventory scanning with real-time lookup
          </p>
        </div>
      </div>

      {/* Site Selection & Session Control */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site
            </label>
            <select
              value={selectedSite}
              onChange={(e) => {
                setSelectedSite(e.target.value)
                setSessionId(null)
                setLookupResult(null)
              }}
              className="input"
              disabled={!!sessionId}
            >
              <option value="">Select Site</option>
              {sites?.map((site) => (
                <option key={site.site_code} value={site.site_code}>
                  {site.site_code} - {site.site_name}
                </option>
              ))}
            </select>
          </div>

          {!sessionId ? (
            <button
              onClick={handleStartSession}
              disabled={!selectedSite || startSessionMutation.isPending}
              className="btn-primary"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Scan Session
            </button>
          ) : (
            <button onClick={handleEndSession} className="btn-secondary bg-red-50 text-red-700 hover:bg-red-100">
              <Square className="w-4 h-4 mr-2" />
              End Session
            </button>
          )}
        </div>

        {/* Session History Toggle */}
        {selectedSite && !sessionId && (
          <div className="mt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              {showHistory ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              Previous Sessions
            </button>
            {showHistory && sessionHistory && (
              <div className="mt-2 space-y-2">
                {sessionHistory.sessions.map((s) => (
                  <div key={s.session_id} className="text-sm p-2 bg-gray-50 rounded flex justify-between">
                    <span>{s.session_name}</span>
                    <span className="text-gray-500">
                      {s.found_count}/{s.expected_count} ({s.progress_percent}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Session */}
      {sessionId && stats && (
        <>
          {/* Progress Bar */}
          <div className="card p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                {stats.session_name}
              </span>
              <span className="text-sm text-gray-500">
                {stats.found_count} / {stats.expected_count} scanned ({stats.progress_percent}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${stats.progress_percent}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-4 text-center text-sm">
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.found_count}</p>
                <p className="text-gray-500">Found</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{stats.not_tracked_count}</p>
                <p className="text-gray-500">Not Tracked</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{stats.good_count}</p>
                <p className="text-gray-500">Good</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.bad_count}</p>
                <p className="text-gray-500">Bad</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              {[
                { id: 'scan', label: 'Scan', icon: Scan },
                { id: 'progress', label: 'Progress by Model', icon: BarChart3 },
                { id: 'scanned', label: 'Scanned Items', icon: List, count: stats.total_scanned },
                { id: 'missing', label: 'Missing', icon: AlertCircle, count: stats.missing_count },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center ${
                    activeTab === tab.id
                      ? 'border-dhl-red text-dhl-red'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4 mr-2" />
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Scan Tab */}
          {activeTab === 'scan' && (
            <div className="space-y-4">
              {/* Scan Input */}
              <div className="card p-6">
                <form onSubmit={handleScan}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scan Barcode or Enter Serial Number
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        ref={scanInputRef}
                        type="text"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        placeholder="Scan or type serial number..."
                        className="input pl-10 text-lg"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!scanInput.trim() || lookupMutation.isPending}
                      className="btn-primary px-6"
                    >
                      Lookup
                    </button>
                  </div>
                </form>
              </div>

              {/* Lookup Result */}
              {lookupResult && (
                <div
                  className={`card p-6 border-2 ${
                    lookupResult.status === 'found'
                      ? 'border-green-500 bg-green-50'
                      : lookupResult.status === 'duplicate'
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-red-500 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center">
                      {lookupResult.status === 'found' ? (
                        <CheckCircle className="w-8 h-8 text-green-500" />
                      ) : lookupResult.status === 'duplicate' ? (
                        <AlertTriangle className="w-8 h-8 text-amber-500" />
                      ) : (
                        <XCircle className="w-8 h-8 text-red-500" />
                      )}
                      <div className="ml-4">
                        <h3 className="text-lg font-semibold">
                          {lookupResult.status === 'found'
                            ? 'Asset Found'
                            : lookupResult.status === 'duplicate'
                            ? 'Already Scanned'
                            : 'Not Tracked'}
                        </h3>
                        {lookupResult.status === 'found' && (
                          <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                            <p>
                              <span className="text-gray-500">Serial:</span>{' '}
                              <span className="font-medium">{lookupResult.serial_number as string}</span>
                            </p>
                            <p>
                              <span className="text-gray-500">Model:</span>{' '}
                              <span className="font-medium">{lookupResult.model as string}</span>
                            </p>
                            <p>
                              <span className="text-gray-500">Type:</span>{' '}
                              <span className="font-medium">{lookupResult.asset_type as string}</span>
                            </p>
                            <p>
                              <span className="text-gray-500">Current Condition:</span>{' '}
                              <span className="font-medium">{(lookupResult.current_condition as string) || 'N/A'}</span>
                            </p>
                            {lookupResult.mdm_status ? (
                              <p className="flex items-center">
                                <span className="text-gray-500">MDM:</span>{' '}
                                {(lookupResult.mdm_days_since_connect as number) === 0 ? (
                                  <span className="ml-1 flex items-center text-green-600">
                                    <Wifi className="w-3 h-3 mr-1" /> Connected
                                  </span>
                                ) : (
                                  <span className="ml-1 flex items-center text-amber-600">
                                    <WifiOff className="w-3 h-3 mr-1" /> {lookupResult.mdm_days_since_connect as number}d ago
                                  </span>
                                )}
                              </p>
                            ) : null}
                          </div>
                        )}
                        {lookupResult.status === 'duplicate' && (
                          <p className="text-sm text-amber-700 mt-1">
                            Scanned at {lookupResult.scanned_at as string} - Condition: {lookupResult.recorded_condition as string}
                          </p>
                        )}
                        {lookupResult.status === 'not_tracked' && (
                          <p className="text-sm text-red-700 mt-1">
                            This device is not in the master data for this site.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Condition Buttons */}
                  {lookupResult.status !== 'duplicate' && (
                    <div className="mt-6 flex justify-center gap-4">
                      <button
                        onClick={() => handleRecordCondition('G')}
                        disabled={recordMutation.isPending}
                        className="flex-1 max-w-xs py-4 px-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-lg flex items-center justify-center"
                      >
                        <CheckCircle className="w-6 h-6 mr-2" />
                        Good (G)
                      </button>
                      <button
                        onClick={() => handleRecordCondition('B')}
                        disabled={recordMutation.isPending}
                        className="flex-1 max-w-xs py-4 px-6 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-lg flex items-center justify-center"
                      >
                        <XCircle className="w-6 h-6 mr-2" />
                        Bad (B)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Keyboard Shortcuts Help */}
              <div className="text-center text-sm text-gray-500">
                <p>
                  Press <kbd className="px-2 py-1 bg-gray-100 rounded border">G</kbd> for Good or{' '}
                  <kbd className="px-2 py-1 bg-gray-100 rounded border">B</kbd> for Bad after scanning
                </p>
              </div>
            </div>
          )}

          {/* Progress by Model Tab */}
          {activeTab === 'progress' && modelBreakdown && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                  <p className="text-3xl font-bold text-gray-900">{modelBreakdown.total_expected}</p>
                  <p className="text-sm text-gray-500">Expected</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{modelBreakdown.total_scanned}</p>
                  <p className="text-sm text-gray-500">Scanned</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-3xl font-bold text-amber-600">{modelBreakdown.total_remaining}</p>
                  <p className="text-sm text-gray-500">Remaining</p>
                </div>
              </div>

              {/* Progress by Asset Type */}
              <div className="card overflow-hidden">
                <div className="p-4 bg-gray-50 border-b">
                  <h3 className="font-semibold text-gray-900 flex items-center">
                    <Package className="w-5 h-5 mr-2" />
                    Progress by Device Type
                  </h3>
                </div>
                <div className="divide-y divide-gray-200">
                  {modelBreakdown.by_type.map((type) => (
                    <div key={type.asset_type} className="p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-medium text-gray-900">{type.asset_type}</div>
                        <div className="text-sm">
                          <span className="text-green-600 font-semibold">{type.scanned}</span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="text-gray-600">{type.expected}</span>
                          {type.remaining > 0 && (
                            <span className="ml-2 text-amber-600">({type.remaining} remaining)</span>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            type.remaining === 0 ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${type.expected > 0 ? (type.scanned / type.expected) * 100 : 0}%` }}
                        />
                      </div>

                      {/* Models within this type */}
                      <div className="ml-4 space-y-2">
                        {type.models.map((model) => (
                          <div key={model.model} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 truncate flex-1">{model.model}</span>
                            <div className="flex items-center gap-3 ml-4">
                              <div className="w-32 bg-gray-100 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    model.remaining === 0 ? 'bg-green-400' : 'bg-blue-400'
                                  }`}
                                  style={{ width: `${model.expected > 0 ? (model.scanned / model.expected) * 100 : 0}%` }}
                                />
                              </div>
                              <span className="text-gray-500 w-20 text-right">
                                {model.scanned}/{model.expected}
                              </span>
                              {model.remaining > 0 ? (
                                <span className="text-amber-600 w-16 text-right">-{model.remaining}</span>
                              ) : (
                                <CheckCircle className="w-4 h-4 text-green-500 w-16" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {modelBreakdown.by_type.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    No assets found in master data for this site
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scanned Items Tab */}
          {activeTab === 'scanned' && scannedItems && (
            <div className="card overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Scanned Value
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Model
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Condition
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {scannedItems.items.map((item) => (
                    <tr key={item.result_id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {item.scanned_value}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            item.scan_status === 'found'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {item.scan_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {item.master_model || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            item.recorded_condition === 'Good'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {item.recorded_condition}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(item.scanned_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scannedItems.items.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  No items scanned yet
                </div>
              )}
            </div>
          )}

          {/* Missing Assets Tab */}
          {activeTab === 'missing' && missingAssets && (
            <div className="card overflow-hidden">
              <div className="p-4 bg-amber-50 border-b border-amber-200">
                <p className="text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  {missingAssets.total} assets have not been scanned yet
                </p>
              </div>
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
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Last Condition
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      MDM Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {missingAssets.items.map((asset) => (
                    <tr key={asset.asset_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {asset.serial_number}
                        {asset.hsn && asset.hsn !== asset.serial_number && (
                          <span className="block text-xs text-gray-400">HSN: {asset.hsn}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{asset.model}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{asset.asset_type}</td>
                      <td className="px-4 py-3 text-sm">
                        {asset.recorded_condition ? (
                          <span
                            className={`px-2 py-1 text-xs rounded ${
                              asset.recorded_condition === 'Good'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {asset.recorded_condition}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {asset.mdm_status === 'enrolled' ? (
                          asset.mdm_days_since_connect === 0 ? (
                            <span className="flex items-center text-green-600">
                              <Wifi className="w-3 h-3 mr-1" /> Connected
                            </span>
                          ) : (
                            <span className="flex items-center text-amber-600">
                              <WifiOff className="w-3 h-3 mr-1" /> {asset.mdm_days_since_connect}d
                            </span>
                          )
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {missingAssets.items.length === 0 && (
                <div className="p-8 text-center text-green-600">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2" />
                  All assets have been scanned!
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* No Session Message */}
      {!sessionId && selectedSite && (
        <div className="card p-12 text-center">
          <Scan className="w-16 h-16 mx-auto text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Active Session</h3>
          <p className="mt-2 text-sm text-gray-500">
            Start a scan session to begin auditing assets at {selectedSite}
          </p>
        </div>
      )}

      {!selectedSite && (
        <div className="card p-12 text-center">
          <Scan className="w-16 h-16 mx-auto text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Select a Site</h3>
          <p className="mt-2 text-sm text-gray-500">
            Choose a site to start scanning assets
          </p>
        </div>
      )}
    </div>
  )
}
