/**
 * Collapsible section card for dashboard sections.
 * Persists expand/collapse state to localStorage.
 */
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface SectionCardProps {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultExpanded?: boolean
  storageKey?: string
  action?: React.ReactNode
}

export default function SectionCard({
  title,
  icon,
  children,
  defaultExpanded = true,
  storageKey,
  action,
}: SectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (storageKey) {
      const stored = localStorage.getItem(`section-${storageKey}`)
      return stored !== null ? stored === 'true' : defaultExpanded
    }
    return defaultExpanded
  })

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`section-${storageKey}`, String(isExpanded))
    }
  }, [isExpanded, storageKey])

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </button>
      {isExpanded && <div>{children}</div>}
    </div>
  )
}
