'use client'

import { useEffect, useState, useCallback } from 'react'
import { CriteriaStatsBar } from './criteria-stats-bar'
import { CriteriaIdentityBar } from './criteria-identity-bar'
import { CriteriaFilterBar } from './criteria-filter-bar'
import { CriteriaTable } from './criteria-table'
import { CriteriaChangelog } from './criteria-changelog'
import type { PhaseData, FilterMode, ChangelogEntry } from './types'

function calcStats(criteria: { qaStatus: string }[]) {
  return {
    total: criteria.length,
    pass: criteria.filter(c => c.qaStatus === 'pass').length,
    fail: criteria.filter(c => c.qaStatus === 'fail').length,
    blocked: criteria.filter(c => c.qaStatus === 'blocked').length,
    untested: criteria.filter(c => c.qaStatus === 'untested').length,
  }
}

function applyUpdate(
  phases: PhaseData[],
  keys: Set<string>,
  update: { assignee?: string; qaStatus?: string },
  activeUser: string
): PhaseData[] {
  return phases.map(phase => {
    const newScopes = phase.scopes.map(scope => {
      const newCategories = scope.categories.map(cat => ({
        ...cat,
        criteria: cat.criteria.map(c => {
          if (!keys.has(c.key)) return c
          return {
            ...c,
            assignee: update.assignee !== undefined ? update.assignee : c.assignee,
            qaStatus: (update.qaStatus as typeof c.qaStatus) || c.qaStatus,
            updatedBy: activeUser,
            updatedAt: new Date().toISOString(),
          }
        }),
      }))
      return {
        ...scope,
        categories: newCategories,
        stats: calcStats(newCategories.flatMap(c => c.criteria)),
      }
    })
    return {
      ...phase,
      scopes: newScopes,
      stats: calcStats(newScopes.flatMap(s => s.categories.flatMap(c => c.criteria))),
    }
  })
}

export function CriteriaPanel() {
  const [phases, setPhases] = useState<PhaseData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeUser, setActiveUser] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('criteria-active-user') || 'jake'
    }
    return 'jake'
  })
  const [filter, setFilter] = useState<FilterMode>('all')
  const [showChangelog, setShowChangelog] = useState(false)
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([])

  const fetchCriteria = useCallback(async () => {
    try {
      const res = await fetch('/api/criteria')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPhases(data.phases || [])
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchChangelog = useCallback(async () => {
    try {
      const res = await fetch('/api/criteria/changelog?limit=30')
      if (!res.ok) return
      const data = await res.json()
      setChangelog(data.changes || [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchCriteria()
    fetchChangelog()
    const interval = setInterval(() => {
      fetchCriteria()
      fetchChangelog()
    }, 120000)
    return () => clearInterval(interval)
  }, [fetchCriteria, fetchChangelog])

  const handleUserChange = useCallback((user: string) => {
    setActiveUser(user)
    if (typeof window !== 'undefined') {
      localStorage.setItem('criteria-active-user', user)
    }
  }, [])

  const handleUpdate = useCallback(
    async (key: string, update: { assignee?: string; qaStatus?: string; notes?: string }) => {
      setPhases(prev => applyUpdate(prev, new Set([key]), update, activeUser))

      try {
        await fetch(`/api/criteria/${encodeURIComponent(key)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...update, updatedBy: activeUser }),
        })
        fetchChangelog()
      } catch {
        fetchCriteria()
      }
    },
    [activeUser, fetchCriteria, fetchChangelog]
  )

  const handleBatchUpdate = useCallback(
    async (keys: string[], update: { assignee?: string; qaStatus?: string }) => {
      if (keys.length === 0) return
      setPhases(prev => applyUpdate(prev, new Set(keys), update, activeUser))

      try {
        await fetch('/api/criteria/batch', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys, ...update, updatedBy: activeUser }),
        })
        fetchChangelog()
      } catch {
        fetchCriteria()
      }
    },
    [activeUser, fetchCriteria, fetchChangelog]
  )

  const handleAdd = useCallback(
    async (params: {
      type: 'criterion' | 'category' | 'scope'
      phase?: string
      scope?: string
      category?: string
      text?: string
      scopeSlug?: string
      scopeLabel?: string
      categoryName?: string
    }) => {
      try {
        const res = await fetch('/api/criteria/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        await fetchCriteria()
      } catch (err) {
        setError(String(err))
        setTimeout(() => setError(null), 3000)
      }
    },
    [fetchCriteria]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading criteria...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Failed to load criteria: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f7fa]">
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Success Criteria Tracker</h1>
            <p className="text-sm text-gray-500 mt-0.5">Track verification progress across all scopes</p>
          </div>
          <div className="flex items-center gap-3">
            <CriteriaIdentityBar activeUser={activeUser} onUserChange={handleUserChange} />
            <button
              onClick={() => setShowChangelog(!showChangelog)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                showChangelog
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              History
            </button>
          </div>
        </div>
        <CriteriaStatsBar phases={phases} />
        <CriteriaFilterBar filter={filter} onFilterChange={setFilter} />
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className={`flex-1 overflow-auto ${showChangelog ? 'border-r border-gray-200' : ''}`}>
          <CriteriaTable
            phases={phases}
            filter={filter}
            activeUser={activeUser}
            onUpdate={handleUpdate}
            onBatchUpdate={handleBatchUpdate}
            onAdd={handleAdd}
          />
        </div>
        {showChangelog && (
          <div className="w-80 shrink-0 overflow-auto bg-white p-5 border-l border-gray-100">
            <CriteriaChangelog changes={changelog} />
          </div>
        )}
      </div>
    </div>
  )
}
