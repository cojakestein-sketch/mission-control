'use client'

import type { FilterMode } from './types'

interface Props {
  filter: FilterMode
  onFilterChange: (filter: FilterMode) => void
}

const FILTERS: { value: FilterMode; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '' },
  { value: 'untested', label: 'Untested', icon: '○' },
  { value: 'pass', label: 'Pass', icon: '✓' },
  { value: 'fail', label: 'Fail', icon: '✗' },
  { value: 'blocked', label: 'Blocked', icon: '■' },
  { value: 'mine', label: 'Mine', icon: '' },
]

export function CriteriaFilterBar({ filter, onFilterChange }: Props) {
  return (
    <div className="flex items-center gap-1 mt-3">
      {FILTERS.map(f => (
        <button
          key={f.value}
          onClick={() => onFilterChange(f.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
            filter === f.value
              ? 'bg-gray-900 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {f.icon && <span className="mr-1">{f.icon}</span>}
          {f.label}
        </button>
      ))}
    </div>
  )
}
