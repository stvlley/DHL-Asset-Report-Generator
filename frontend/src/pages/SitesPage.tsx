import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sitesApi } from '../services/api'
import { useAuthStore } from '../hooks/useAuthStore'
import { Building2, Plus, Search, MapPin, User } from 'lucide-react'

export default function SitesPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSite, setNewSite] = useState({
    site_code: '',
    site_name: '',
    account_name: '',
    region: '',
    address: '',
    primary_contact: '',
  })
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
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

  const filteredSites = sites?.filter(
    (site) =>
      site.site_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      site.site_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      site.account_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const isAdmin = user?.role === 'admin'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage distribution center sites
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
            <div key={site.site_code} className="card p-4">
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
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <Building2 className="w-12 h-12 mx-auto text-gray-400" />
          <p className="mt-4 text-sm text-gray-500">No sites found</p>
        </div>
      )}
    </div>
  )
}
