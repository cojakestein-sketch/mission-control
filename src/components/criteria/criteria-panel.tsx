'use client'

import { useEffect, useState, useCallback } from 'react'
import { CriteriaStatsBar } from './criteria-stats-bar'
import { CriteriaIdentityBar } from './criteria-identity-bar'
import { CriteriaFilterBar } from './criteria-filter-bar'
import { CriteriaTable } from './criteria-table'
import { CriteriaChangelog } from './criteria-changelog'
import type { PhaseData, FilterMode, ChangelogEntry } from './types'

export function CriteriaPanel() {
  const [phases, setPhases] = useState<PhaseData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeUser, setActiveUser] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('criteria-active-user') || ''
    }
    return ''
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
      if (!activeUser) return

      // Optimistic update
      setPhases(prev =>
        prev.map(phase => ({
          ...phase,
          scopes: phase.scopes.map(scope => ({
            ...scope,
            categories: scope.categories.map(cat => ({
              ...cat,
              criteria: cat.criteria.map(c => {
                if (c.key !== key) return c
                return {
                  ...c,
                  assignee: update.assignee !== undefined ? update.assignee : c.assignee,
                  qaStatus: (update.qaStatus as typeof c.qaStatus) || c.qaStatus,
                  notes: update.notes !== undefined ? update.notes : c.notes,
                  updatedBy: activeUser,
                  updatedAt: new Date().toISOString(),
                }
              }),
            })),
            stats: (() => {
              const allCriteria = scope.categories.flatMap(cat =>
                cat.criteria.map(c => {
                  if (c.key !== key) return c
                  return {
                    ...c,
                    qaStatus: (update.qaStatus as typeof c.qaStatus) || c.qaStatus,
                  }
                })
              )
              return {
                total: allCriteria.length,
                pass: allCriteria.filter(c => c.qaStatus === 'pass').length,
                fail: allCriteria.filter(c => c.qaStatus === 'fail').length,
                blocked: allCriteria.filter(c => c.qaStatus === 'blocked').length,
                untested: allCriteria.filter(c => c.qaStatus === 'untested').length,
              }
            })(),
          })),
          stats: (() => {
            const allCriteria = phase.scopes.flatMap(scope =>
              scope.categories.flatMap(cat =>
                cat.criteria.map(c => {
                  if (c.key !== key) return c
                  return {
                    ...c,
                    qaStatus: (update.qaStatus as typeof c.qaStatus) || c.qaStatus,
                  }
                })
              )
            )
            return {
              total: allCriteria.length,
              pass: allCriteria.filter(c => c.qaStatus === 'pass').length,
              fail: allCriteria.filter(c => c.qaStatus === 'fail').length,
              blocked: allCriteria.filter(c => c.qaStatus === 'blocked').length,
              untested: allCriteria.filter(c => c.qaStatus === 'untested').length,
            }
          })(),
        }))
      )

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
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900">Success Criteria Tracker</h1>
          <div className="flex items-center gap-3">
            <CriteriaIdentityBar activeUser={activeUser} onUserChange={handleUserChange} />
            <button
              onClick={() => setShowChangelog(!showChangelog)}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
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
          />
        </div>
        {showChangelog && (
          <div className="w-72 shrink-0 overflow-auto bg-gray-50 p-4">
            <CriteriaChangelog changes={changelog} />
          </div>
        )}
      </div>
    </div>
  )
}
