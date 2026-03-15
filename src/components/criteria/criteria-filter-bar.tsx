'use client'

import type { FilterMode } from './types'

interface Props {
  filter: FilterMode
  onFilterChange: (filter: FilterMode) => void
}

const FILTERS: { value: FilterMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'untested', label: 'Untested' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'mine', label: 'Mine' },
]

export function CriteriaFilterBar({ filter, onFilterChange }: Props) {
  return (
    <div className="flex items-center gap-1 mt-3">
      {FILTERS.map(f => (
        <button
          key={f.value}
          onClick={() => onFilterChange(f.value)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filter === f.value
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
