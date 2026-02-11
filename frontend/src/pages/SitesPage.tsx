import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sitesApi, itAllocationApi } from '../services/api'
import { useAuthStore } from '../hooks/useAuthStore'
import type { Site } from '../types'
import {
  Building2,
  Plus,
  Search,
  MapPin,
  User,
  X,
  Trash2,
  DollarSign,
  Pencil,
  AlertTriangle,
} from 'lucide-react'

export default function SitesPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedSite, setSelectedSite] = useState<Site | null>(null)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [deletingSite, setDeletingSite] = useState<Site | null>(null)
  const [newSite, setNewSite] = useState({
    site_code: '',
    site_name: '',
    account_name: '',
    region: '',
    address: '',
    primary_contact: '',
  })
  const [editFormData, setEditFormData] = useState({
    site_name: '',
    account_name: '',
    region: '',
    address: '',
    primary_contact: '',
    is_active: true,
  })
  const [newGLString, setNewGLString] = useState('')
  const [newGLCategory, setNewGLCategory] = useState('RF HARDWARE')
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  })

  // Fetch available GL strings from IT Allocation
  const { data: glSummary } = useQuery({
    queryKey: ['gl-summary'],
    queryFn: () => itAllocationApi.getGLSummary(),
  })

  // Fetch GL mappings for selected site
  const { data: siteGLMappings, refetch: refetchMappings } = useQuery({
    queryKey: ['site-gl-mappings', selectedSite?.site_code],
    queryFn: () =>
      selectedSite ? itAllocationApi.getSiteGLMappings(selectedSite.site_code) : Promise.resolve([]),
    enabled: !!selectedSite,
  })

  const createMutation = useMutation({
    mutationFn: sitesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setShowAddForm(false)
      setNewSite({
        site_code: '',
        site_name: '',
        account_name: '',
        region: '',
        address: '',
        primary_contact: '',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ siteCode, data }: { siteCode: string; data: typeof editFormData }) =>
      sitesApi.update(siteCode, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setEditingSite(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (siteCode: string) => sitesApi.delete(siteCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setDeletingSite(null)
    },
  })

  const addGLMappingMutation = useMutation({
    mutationFn: (data: { site_code: string; gl_string: string; category?: string }) =>
      itAllocationApi.createSiteGLMapping(data),
    onSuccess: () => {
      refetchMappings()
      setNewGLString('')
    },
  })

  const deleteGLMappingMutation = useMutation({
    mutationFn: (mappingId: number) => itAllocationApi.deleteSiteGLMapping(mappingId),
    onSuccess: () => {
      refetchMappings()
    },
  })

  const filteredSites = sites?.filter(
    (site) =>
      site.site_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      site.site_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      site.account_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const isAdmin = user?.role === 'admin'

  // Get unique GL strings from summary
  const availableGLStrings = glSummary
    ? [...new Set(glSummary.map((g) => g.gl_string))]
    : []

  const handleAddGLMapping = () => {
    if (selectedSite && newGLString) {
      addGLMappingMutation.mutate({
        site_code: selectedSite.site_code,
        gl_string: newGLString,
        category: newGLCategory,
      })
    }
  }

  const openEditModal = (site: Site) => {
    setEditFormData({
      site_name: site.site_name,
      account_name: site.account_name,
      region: site.region || '',
      address: site.address || '',
      primary_contact: site.primary_contact || '',
      is_active: site.is_active,
    })
    setEditingSite(site)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingSite) {
      updateMutation.mutate({
        siteCode: editingSite.site_code,
        data: editFormData,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage distribution center sites and GL assignments
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Add Site
          </button>
        )}
      </div>

      {/* Add Site Form */}
      {showAddForm && isAdmin && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add New Site</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createMutation.mutate(newSite)
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="label">Site Code *</label>
              <input
                type="text"
                value={newSite.site_code}
                onChange={(e) =>
                  setNewSite({ ...newSite, site_code: e.target.value })
                }
                className="input"
                placeholder="PLCB-001"
                required
              />
            </div>
            <div>
              <label className="label">Site Name *</label>
              <input
                type="text"
                value={newSite.site_name}
                onChange={(e) =>
                  setNewSite({ ...newSite, site_name: e.target.value })
                }
                className="input"
                placeholder="Philadelphia Distribution Center"
                required
              />
            </div>
            <div>
              <label className="label">Account Name *</label>
              <input
                type="text"
                value={newSite.account_name}
                onChange={(e) =>
                  setNewSite({ ...newSite, account_name: e.target.value })
                }
                className="input"
                placeholder="PLCB"
                required
              />
            </div>
            <div>
              <label className="label">Region</label>
              <input
                type="text"
                value={newSite.region}
                onChange={(e) => setNewSite({ ...newSite, region: e.target.value })}
                className="input"
                placeholder="Northeast"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Address</label>
              <input
                type="text"
                value={newSite.address}
                onChange={(e) =>
                  setNewSite({ ...newSite, address: e.target.value })
                }
                className="input"
                placeholder="123 Main St, Philadelphia, PA"
              />
            </div>
            <div>
              <label className="label">Primary Contact</label>
              <input
                type="text"
                value={newSite.primary_contact}
                onChange={(e) =>
                  setNewSite({ ...newSite, primary_contact: e.target.value })
                }
                className="input"
                placeholder="John Smith"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Site'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search sites..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Sites Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red" />
        </div>
      ) : filteredSites && filteredSites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSites.map((site) => (
            <div
              key={site.site_code}
              className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedSite(site)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <div className="p-2 bg-dhl-yellow rounded-lg">
                    <Building2 className="w-5 h-5 text-gray-900" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {site.site_code}
                    </h3>
                    <p className="text-sm text-gray-500">{site.site_name}</p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded ${
                    site.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {site.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm text-gray-500">
                <div className="flex items-center">
                  <span className="font-medium text-gray-700 w-20">Account:</span>
                  {site.account_name}
                </div>
                {site.region && (
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {site.region}
                  </div>
                )}
                {site.primary_contact && (
                  <div className="flex items-center">
                    <User className="w-4 h-4 mr-1" />
                    {site.primary_contact}
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedSite(site)
                  }}
                  className="text-xs text-dhl-red hover:text-red-700 flex items-center"
                >
                  <DollarSign className="w-3 h-3 mr-1" />
                  Manage GL Strings
                </button>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditModal(site)
                      }}
                      className="p-1 text-gray-400 hover:text-blue-600"
                      title="Edit site"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingSite(site)
                      }}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Delete site"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <Building2 className="w-12 h-12 mx-auto text-gray-400" />
          <p className="mt-4 text-sm text-gray-500">No sites found</p>
        </div>
      )}

      {/* Site GL Mapping Modal */}
      {selectedSite && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setSelectedSite(null)}
            />

            <div className="relative inline-block w-full max-w-2xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedSite.site_name}
                  </h3>
                  <p className="text-sm text-gray-500">{selectedSite.site_code}</p>
                </div>
                <button
                  onClick={() => setSelectedSite(null)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Current GL Mappings */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Assigned GL Strings
                </h4>
                {siteGLMappings && siteGLMappings.length > 0 ? (
                  <div className="space-y-2">
                    {siteGLMappings.map((mapping) => (
                      <div
                        key={mapping.mapping_id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <span className="font-mono text-sm text-gray-900">
                            {mapping.gl_string}
                          </span>
                          <span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                            {mapping.category || 'General'}
                          </span>
                          {mapping.is_primary === 1 && (
                            <span className="ml-2 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                              Primary
                            </span>
                          )}
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => deleteGLMappingMutation.mutate(mapping.mapping_id)}
                            className="p-1 text-red-500 hover:text-red-700"
                            disabled={deleteGLMappingMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    No GL strings assigned to this site
                  </p>
                )}
              </div>

              {/* Add GL Mapping */}
              {isAdmin && (
                <div className="border-t pt-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Add GL String
                  </h4>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <select
                        value={newGLString}
                        onChange={(e) => setNewGLString(e.target.value)}
                        className="input"
                      >
                        <option value="">Select GL String...</option>
                        {availableGLStrings.map((gl) => (
                          <option key={gl} value={gl}>
                            {gl}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-40">
                      <select
                        value={newGLCategory}
                        onChange={(e) => setNewGLCategory(e.target.value)}
                        className="input"
                      >
                        <option value="RF HARDWARE">RF Hardware</option>
                        <option value="RF SOFTWARE">RF Software</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddGLMapping}
                      disabled={!newGLString || addGLMappingMutation.isPending}
                      className="btn-primary"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Manual GL entry */}
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">
                      Or enter a GL string manually:
                    </p>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        placeholder="e.g., 61.5851.5531.8233.10.000"
                        value={newGLString}
                        onChange={(e) => setNewGLString(e.target.value)}
                        className="input flex-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Available GL Strings from IT Allocation */}
              {glSummary && glSummary.length > 0 && (
                <div className="mt-6 border-t pt-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Available GL Strings (from IT Allocation)
                  </h4>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium text-gray-600">GL String</th>
                          <th className="text-left p-2 font-medium text-gray-600">Category</th>
                          <th className="text-right p-2 font-medium text-gray-600">Devices</th>
                          <th className="text-right p-2 font-medium text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {glSummary.map((summary, idx) => (
                          <tr
                            key={`${summary.gl_string}-${summary.category}-${idx}`}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => {
                              setNewGLString(summary.gl_string)
                              setNewGLCategory(summary.category)
                            }}
                          >
                            <td className="p-2 font-mono text-xs">{summary.gl_string}</td>
                            <td className="p-2 text-xs">{summary.category}</td>
                            <td className="p-2 text-right">{summary.device_count}</td>
                            <td className="p-2 text-right">
                              ${summary.total_amount?.toLocaleString() || '0'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button onClick={() => setSelectedSite(null)} className="btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Site Modal */}
      {editingSite && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setEditingSite(null)}
            />

            <div className="relative inline-block w-full max-w-lg p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Edit Site</h3>
                  <p className="text-sm text-gray-500">{editingSite.site_code}</p>
                </div>
                <button
                  onClick={() => setEditingSite(null)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="label">Site Name *</label>
                  <input
                    type="text"
                    value={editFormData.site_name}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, site_name: e.target.value })
                    }
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Account Name *</label>
                  <input
                    type="text"
                    value={editFormData.account_name}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, account_name: e.target.value })
                    }
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Region</label>
                  <input
                    type="text"
                    value={editFormData.region}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, region: e.target.value })
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Address</label>
                  <input
                    type="text"
                    value={editFormData.address}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, address: e.target.value })
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Primary Contact</label>
                  <input
                    type="text"
                    value={editFormData.primary_contact}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, primary_contact: e.target.value })
                    }
                    className="input"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editFormData.is_active}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, is_active: e.target.checked })
                    }
                    className="rounded border-gray-300 text-dhl-red focus:ring-dhl-red"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Site is active
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingSite(null)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="btn-primary"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSite && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setDeletingSite(null)}
            />

            <div className="relative inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Site</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone.</p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-gray-700">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold">{deletingSite.site_name}</span> (
                  {deletingSite.site_code})?
                </p>
                <p className="mt-2 text-sm text-red-600">
                  Warning: This will also remove all GL string mappings and may affect audit records.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeletingSite(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate(deletingSite.site_code)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Site'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
