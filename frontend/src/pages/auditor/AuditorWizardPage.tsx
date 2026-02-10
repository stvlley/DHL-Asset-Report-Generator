import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'
import { sitesApi, scanAuditApi } from '../../services/api'
import {
  Building2,
  Scan,
  CheckCircle2,
  ClipboardList,
  ChevronRight,
  Play,
  Clock,
  AlertTriangle,
} from 'lucide-react'

type WizardStep = 'select-site' | 'scanning' | 'review' | 'complete'

interface ScanSession {
  session_id: string
  site_code: string
  status: string
  scanned_count: number
  expected_count: number
}

export default function AuditorWizardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { assignedSites, isSuperUser, isAdmin } = usePermissions()

  const [currentStep, setCurrentStep] = useState<WizardStep>('select-site')
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [activeSession, setActiveSession] = useState<ScanSession | null>(null)

  // Fetch sites (filtered by assigned sites for auditors)
  const { data: sites, isLoading: sitesLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  // Filter sites based on user's assignments (unless admin/super user)
  const availableSites = (sites || []).filter((site) => {
    if (isAdmin || isSuperUser) return true
    return assignedSites.includes(site.site_code)
  })

  // Check for active session on selected site
  const { data: activeSessionData } = useQuery({
    queryKey: ['scan-session-active', selectedSite],
    queryFn: () => scanAuditApi.getActiveSession(selectedSite),
    enabled: !!selectedSite,
  })

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: (siteCode: string) => scanAuditApi.startSession({ site_code: siteCode }),
    onSuccess: (data) => {
      setActiveSession({
        session_id: data.session_id,
        site_code: data.site_code,
        status: 'active',
        scanned_count: 0,
        expected_count: data.expected_count,
      })
      setCurrentStep('scanning')
      queryClient.invalidateQueries({ queryKey: ['scan-session-active'] })
    },
  })

  // If there's an active session for the selected site, use it
  const existingSession = activeSessionData?.active && activeSessionData.session ? {
    session_id: activeSessionData.session.session_id,
    site_code: activeSessionData.session.site_code,
    status: 'active',
    scanned_count: activeSessionData.session.total_scanned,
    expected_count: activeSessionData.session.expected_count,
  } : null

  // Handle site selection and start
  const handleStartAudit = () => {
    if (!selectedSite) return
    startSessionMutation.mutate(selectedSite)
  }

  // Handle continuing an existing session
  const handleContinueSession = (session: ScanSession) => {
    setActiveSession(session)
    setSelectedSite(session.site_code)
    setCurrentStep('scanning')
  }

  // Steps indicator
  const steps = [
    { id: 'select-site', name: 'Select Site', icon: Building2 },
    { id: 'scanning', name: 'Scan Assets', icon: Scan },
    { id: 'review', name: 'Review', icon: ClipboardList },
    { id: 'complete', name: 'Complete', icon: CheckCircle2 },
  ]

  const currentStepIndex = steps.findIndex(s => s.id === currentStep)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Audits</h1>
        <p className="mt-1 text-sm text-gray-500">
          Follow the steps to complete your site audit
        </p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <nav aria-label="Progress">
          <ol className="flex items-center">
            {steps.map((step, index) => (
              <li key={step.id} className={`relative ${index !== steps.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex items-center">
                  <div
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full ${
                      index < currentStepIndex
                        ? 'bg-green-600'
                        : index === currentStepIndex
                        ? 'bg-dhl-red'
                        : 'bg-gray-200'
                    }`}
                  >
                    <step.icon
                      className={`h-5 w-5 ${
                        index <= currentStepIndex ? 'text-white' : 'text-gray-500'
                      }`}
                    />
                  </div>
                  {index !== steps.length - 1 && (
                    <div
                      className={`ml-2 flex-1 h-0.5 ${
                        index < currentStepIndex ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
                <span
                  className={`mt-2 block text-xs font-medium ${
                    index === currentStepIndex ? 'text-dhl-red' : 'text-gray-500'
                  }`}
                >
                  {step.name}
                </span>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow p-6">
        {currentStep === 'select-site' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Select a Site to Audit</h2>
              <p className="mt-1 text-sm text-gray-500">
                Choose from your assigned sites to begin scanning
              </p>
            </div>

            {/* Active Session Notice */}
            {existingSession && selectedSite && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <h3 className="font-medium text-yellow-800">Active Session Found</h3>
                </div>
                <div className="flex items-center justify-between bg-white rounded p-3 border border-yellow-200">
                  <div>
                    <p className="font-medium text-gray-900">{existingSession.site_code}</p>
                    <p className="text-sm text-gray-500">
                      {existingSession.scanned_count} / {existingSession.expected_count} assets scanned
                    </p>
                  </div>
                  <button
                    onClick={() => handleContinueSession(existingSession)}
                    className="px-3 py-1.5 bg-yellow-600 text-white text-sm font-medium rounded hover:bg-yellow-700"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Site Selection */}
            {sitesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin h-8 w-8 border-2 border-dhl-red border-t-transparent rounded-full mx-auto" />
                <p className="mt-2 text-sm text-gray-500">Loading sites...</p>
              </div>
            ) : availableSites.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Sites Assigned</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Contact your administrator to get site access.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {availableSites.map((site) => (
                  <div
                    key={site.site_code}
                    onClick={() => setSelectedSite(site.site_code)}
                    className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
                      selectedSite === site.site_code
                        ? 'border-dhl-red bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">{site.site_code}</h3>
                        <p className="text-sm text-gray-500">{site.site_name}</p>
                        <p className="text-xs text-gray-400 mt-1">{site.account_name}</p>
                      </div>
                      {selectedSite === site.site_code && (
                        <CheckCircle2 className="h-5 w-5 text-dhl-red" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Start Button */}
            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={handleStartAudit}
                disabled={!selectedSite || startSessionMutation.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-dhl-red text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {startSessionMutation.isPending ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Start Audit
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {currentStep === 'scanning' && activeSession && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">
                  Scanning: {activeSession.site_code}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {activeSession.scanned_count} / {activeSession.expected_count} assets scanned
                </p>
              </div>
              <button
                onClick={() => navigate(`/scan-audit?session=${activeSession.session_id}`)}
                className="px-4 py-2 bg-dhl-red text-white font-medium rounded-lg hover:bg-red-700"
              >
                Open Scanner
              </button>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-600 h-3 rounded-full transition-all"
                style={{
                  width: `${
                    activeSession.expected_count > 0
                      ? (activeSession.scanned_count / activeSession.expected_count) * 100
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="flex justify-between pt-4 border-t">
              <button
                onClick={() => {
                  setCurrentStep('select-site')
                  setActiveSession(null)
                }}
                className="px-4 py-2 text-gray-600 font-medium hover:text-gray-800"
              >
                Back to Sites
              </button>
              <button
                onClick={() => setCurrentStep('review')}
                className="flex items-center gap-2 px-6 py-2.5 bg-dhl-red text-white font-medium rounded-lg hover:bg-red-700"
              >
                Review & Complete
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Review Your Audit</h2>
              <p className="mt-1 text-sm text-gray-500">
                Review the scanned items and variances before completing
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <ClipboardList className="h-12 w-12 text-gray-400 mx-auto" />
              <p className="mt-2 text-sm text-gray-500">
                Variance review will be available here
              </p>
              <button
                onClick={() => navigate('/variances')}
                className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded hover:bg-gray-200"
              >
                View All Variances
              </button>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <button
                onClick={() => setCurrentStep('scanning')}
                className="px-4 py-2 text-gray-600 font-medium hover:text-gray-800"
              >
                Back to Scanning
              </button>
              <button
                onClick={() => setCurrentStep('complete')}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                Complete Audit
              </button>
            </div>
          </div>
        )}

        {currentStep === 'complete' && (
          <div className="text-center py-8">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-gray-900">Audit Complete!</h2>
            <p className="mt-2 text-sm text-gray-500">
              Your audit has been submitted for review.
            </p>
            <button
              onClick={() => {
                setCurrentStep('select-site')
                setSelectedSite('')
                setActiveSession(null)
              }}
              className="mt-6 px-6 py-2.5 bg-dhl-red text-white font-medium rounded-lg hover:bg-red-700"
            >
              Start New Audit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
