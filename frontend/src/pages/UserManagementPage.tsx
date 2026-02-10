/**
 * User Management Page - Admin only CRUD for users.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, sitesApi } from '../services/api'
import { usePermissions } from '../hooks/usePermissions'
import type { User, UserRole } from '../types'
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Unlock,
  Search,
  ChevronDown,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  super_user: 'Super User',
  auditor: 'Auditor',
  site_manager: 'Site Manager (Legacy)',
  site_operations: 'Site Operations (Legacy)',
  regional_director: 'Regional Director (Legacy)',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  super_user: 'bg-blue-100 text-blue-800',
  auditor: 'bg-green-100 text-green-800',
  site_manager: 'bg-gray-100 text-gray-600',
  site_operations: 'bg-gray-100 text-gray-600',
  regional_director: 'bg-gray-100 text-gray-600',
}

interface UserFormData {
  email: string
  password: string
  full_name: string
  role: UserRole
  assigned_sites: string[]
  assigned_region: string
}

export default function UserManagementPage() {
  const { isAdmin } = usePermissions()
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<User | null>(null)
  const [showResetPassword, setShowResetPassword] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    password: '',
    full_name: '',
    role: 'auditor',
    assigned_sites: [],
    assigned_region: '',
  })
  const [formError, setFormError] = useState<string | null>(null)

  // Fetch users
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users', roleFilter, statusFilter, searchQuery],
    queryFn: () =>
      usersApi.list({
        role: roleFilter || undefined,
        is_active: statusFilter === '' ? undefined : statusFilter === 'active',
        search: searchQuery || undefined,
      }),
    enabled: isAdmin,
  })

  // Fetch sites for assignment
  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
    enabled: isAdmin,
  })

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: (data: UserFormData) =>
      usersApi.create({
        email: data.email,
        password: data.password,
        full_name: data.full_name || undefined,
        role: data.role,
        assigned_sites: data.assigned_sites,
        assigned_region: data.assigned_region || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowUserModal(false)
      resetForm()
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      setFormError(error.response?.data?.detail || error.message)
    },
  })

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Partial<UserFormData> }) =>
      usersApi.update(userId, {
        email: data.email,
        full_name: data.full_name || undefined,
        role: data.role,
        assigned_sites: data.assigned_sites,
        assigned_region: data.assigned_region || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowUserModal(false)
      setEditingUser(null)
      resetForm()
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      setFormError(error.response?.data?.detail || error.message)
    },
  })

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => usersApi.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowDeleteConfirm(null)
    },
  })

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      usersApi.resetPassword(userId, password),
    onSuccess: () => {
      setShowResetPassword(null)
      setNewPassword('')
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      setFormError(error.response?.data?.detail || error.message)
    },
  })

  // Unlock user mutation
  const unlockMutation = useMutation({
    mutationFn: (userId: string) => usersApi.unlock(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      full_name: '',
      role: 'auditor',
      assigned_sites: [],
      assigned_region: '',
    })
    setFormError(null)
  }

  const openCreateModal = () => {
    resetForm()
    setEditingUser(null)
    setShowUserModal(true)
  }

  const openEditModal = (user: User) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      password: '',
      full_name: user.full_name || '',
      role: user.role,
      assigned_sites: user.assigned_sites || [],
      assigned_region: user.assigned_region || '',
    })
    setFormError(null)
    setShowUserModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (editingUser) {
      updateMutation.mutate({
        userId: editingUser.user_id,
        data: formData,
      })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleSiteToggle = (siteCode: string) => {
    setFormData((prev) => ({
      ...prev,
      assigned_sites: prev.assigned_sites.includes(siteCode)
        ? prev.assigned_sites.filter((s) => s !== siteCode)
        : [...prev.assigned_sites, siteCode],
    }))
  }

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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">Manage user accounts and permissions</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-dhl-red text-white rounded-md hover:bg-red-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Email or name..."
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red pl-10"
              />
            </div>
          </div>

          {/* Role Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="relative">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red pr-10"
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="super_user">Super User</option>
                <option value="auditor">Auditor</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red pr-10"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loadingUsers ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dhl-red mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No Users Found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || roleFilter || statusFilter
                ? 'Try adjusting your filters.'
                : 'Get started by adding a new user.'}
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned Sites
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.user_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.full_name || user.email}
                      </div>
                      {user.full_name && (
                        <div className="text-sm text-gray-500">{user.email}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">
                      {user.assigned_sites && user.assigned_sites.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.assigned_sites.slice(0, 3).map((site) => (
                            <span
                              key={site}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                            >
                              {site}
                            </span>
                          ))}
                          {user.assigned_sites.length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{user.assigned_sites.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">All sites</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm">Active</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <X className="h-4 w-4" />
                        <span className="text-sm">Inactive</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.last_login
                      ? new Date(user.last_login).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="text-gray-400 hover:text-blue-600"
                        title="Edit user"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setShowResetPassword(user)}
                        className="text-gray-400 hover:text-yellow-600"
                        title="Reset password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {!user.is_active && (
                        <button
                          onClick={() => unlockMutation.mutate(user.user_id)}
                          className="text-gray-400 hover:text-green-600"
                          title="Unlock account"
                        >
                          <Unlock className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setShowDeleteConfirm(user)}
                        className="text-gray-400 hover:text-red-600"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* User Create/Edit Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingUser ? 'Edit User' : 'Create User'}
              </h2>
              <button
                onClick={() => {
                  setShowUserModal(false)
                  setEditingUser(null)
                  resetForm()
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-600">{formError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={8}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Minimum 8 characters with uppercase, lowercase, and number
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as UserRole })
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                >
                  <option value="auditor">Auditor</option>
                  <option value="super_user">Super User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assigned Sites
                </label>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto">
                  {sites.length === 0 ? (
                    <p className="text-sm text-gray-500">No sites available</p>
                  ) : (
                    sites.map((site) => (
                      <label
                        key={site.site_code}
                        className="flex items-center gap-2 py-1 hover:bg-gray-50 px-2 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.assigned_sites.includes(site.site_code)}
                          onChange={() => handleSiteToggle(site.site_code)}
                          className="rounded border-gray-300 text-dhl-red focus:ring-dhl-red"
                        />
                        <span className="text-sm">
                          {site.site_code} - {site.site_name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty to grant access to all sites
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                <input
                  type="text"
                  value={formData.assigned_region}
                  onChange={(e) => setFormData({ ...formData, assigned_region: e.target.value })}
                  placeholder="Optional region assignment"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false)
                    setEditingUser(null)
                    resetForm()
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 bg-dhl-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingUser
                      ? 'Update'
                      : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete User</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="mb-6 text-gray-700">
              Are you sure you want to delete{' '}
              <span className="font-semibold">{showDeleteConfirm.email}</span>?
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(showDeleteConfirm.user_id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Reset Password</h3>
                <p className="text-sm text-gray-500">{showResetPassword.email}</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-dhl-red focus:ring-dhl-red"
              />
              <p className="mt-1 text-xs text-gray-500">
                Minimum 8 characters with uppercase, lowercase, and number
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetPassword(null)
                  setNewPassword('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  resetPasswordMutation.mutate({
                    userId: showResetPassword.user_id,
                    password: newPassword,
                  })
                }
                disabled={!newPassword || resetPasswordMutation.isPending}
                className="px-4 py-2 bg-dhl-red text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
