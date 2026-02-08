import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../hooks/useAuthStore'
import {
  LayoutDashboard,
  Upload,
  FileText,
  Database,
  Building2,
  DollarSign,
  LogOut,
  Menu,
  X,
  User,
  Scan,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Scan Audit', href: '/scan-audit', icon: Scan },
  { name: 'Upload Audit', href: '/upload', icon: Upload },
  { name: 'Audits', href: '/audits', icon: FileText },
  { name: 'Master Data', href: '/master-data', icon: Database },
  { name: 'Sites', href: '/sites', icon: Building2 },
  { name: 'IT Allocation', href: '/it-allocation', icon: DollarSign },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <span className="text-xl font-bold text-dhl-red">DHL Asset Audit</span>
          <button onClick={() => setSidebarOpen(false)} className="p-2">
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="mt-4 px-2">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 text-sm font-medium rounded-md mb-1 ${
                  isActive
                    ? 'bg-dhl-yellow text-gray-900'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-1 min-h-0 bg-white border-r border-gray-200">
          {/* Logo */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200">
            <span className="text-xl font-bold text-dhl-red">DHL Asset Audit</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 mt-4 px-2 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  `flex items-center px-4 py-3 text-sm font-medium rounded-md ${
                    isActive
                      ? 'bg-dhl-yellow text-gray-900'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200">
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gray-200 rounded-full">
                <User className="w-5 h-5 text-gray-600" />
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">
                  {user?.full_name || user?.email}
                </p>
                <p className="text-xs text-gray-500 truncate capitalize">
                  {user?.role?.replace('_', ' ')}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-gray-700"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center h-16 bg-white border-b border-gray-200 px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-500"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center lg:hidden">
            <span className="text-sm font-medium text-gray-700">
              {user?.full_name || user?.email}
            </span>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
