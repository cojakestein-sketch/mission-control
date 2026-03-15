'use client'

import { useState, useRef, useEffect } from 'react'
import type { FilterMode } from './types'

interface Props {
  filter: FilterMode
  onFilterChange: (filter: FilterMode) => void
  search: string
  onSearchChange: (search: string) => void
}

const FILTERS: { value: FilterMode; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '' },
  { value: 'untested', label: 'Untested', icon: '○' },
  { value: 'pass', label: 'Pass', icon: '✓' },
  { value: 'fail', label: 'Fail', icon: '✗' },
  { value: 'blocked', label: 'Blocked', icon: '■' },
  { value: 'mine', label: 'Mine', icon: '' },
]

export function CriteriaFilterBar({ filter, onFilterChange, search, onSearchChange }: Props) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex items-center gap-3 mt-3">
      <div className="flex items-center gap-1">
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
      <div className="flex-1" />
      <div className={`relative transition-all duration-200 ${focused ? 'w-72' : 'w-56'}`}>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search by ID, text, or assignee..."
          className="w-full border border-gray-200 rounded-lg pl-8 pr-8 py-1.5 text-xs bg-white text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300 transition-all"
        />
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {!search && !focused && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 font-mono">⌘K</span>
        )}
      </div>
    </div>
  )
}
