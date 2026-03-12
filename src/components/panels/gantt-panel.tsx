'use client'

import { useEffect, useState, useCallback } from 'react'
import { GanttChart } from '@/components/gantt/gantt-chart'
import type { Workstream } from '@/components/gantt/types'

export function GanttPanel() {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkstreams = useCallback(async () => {
    try {
      const res = await fetch('/api/workstreams')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setWorkstreams(data.workstreams || [])
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkstreams()
    const interval = setInterval(fetchWorkstreams, 120000) // refresh every 2 min
    return () => clearInterval(interval)
  }, [fetchWorkstreams])

  const handleTaskToggle = useCallback(async (taskId: string, newStatus: 'todo' | 'done') => {
    // Optimistic update
    setWorkstreams(prev =>
      prev.map(ws => ({
        ...ws,
        subTasks: ws.subTasks.map(t =>
          t.id === taskId ? { ...t, status: newStatus } : t
        ),
        progress: (() => {
          const tasks = ws.subTasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
          const done = tasks.filter(t => t.status === 'done').length
          return tasks.length > 0 ? done / tasks.length : 0
        })(),
      }))
    )

    try {
      await fetch(`/api/workstream-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch {
      // Revert on failure
      fetchWorkstreams()
    }
  }, [fetchWorkstreams])

  const handleStatusChange = useCallback(async (workstreamId: string, newStatus: string) => {
    setWorkstreams(prev =>
      prev.map(ws =>
        ws.id === workstreamId
          ? { ...ws, status: newStatus as Workstream['status'] }
          : ws
      )
    )

    try {
      await fetch(`/api/workstreams/${workstreamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch {
      fetchWorkstreams()
    }
  }, [fetchWorkstreams])

  const handleFrdLoaded = useCallback((workstreamId: string, content: string) => {
    setWorkstreams(prev =>
      prev.map(ws =>
        ws.id === workstreamId
          ? { ...ws, frdContent: content }
          : ws
      )
    )
  }, [])

  const handleDragReschedule = useCallback(async (workstreamId: string, newStart: string, newEnd: string) => {
    // Optimistic update
    setWorkstreams(prev =>
      prev.map(ws =>
        ws.id === workstreamId
          ? { ...ws, startDate: newStart, endDate: newEnd }
          : ws
      )
    )

    try {
      const res = await fetch(`/api/workstreams/${workstreamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: newStart, endDate: newEnd }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      // Snap back — refetch to revert
      fetchWorkstreams()
    }
  }, [fetchWorkstreams])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading Gantt data...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-red-500">Failed to load workstreams</p>
        <button
          onClick={fetchWorkstreams}
          className="text-xs text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (workstreams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <p className="text-sm">No workstreams yet</p>
        <p className="text-xs">Workstreams will appear here when seeded or synced from Marty.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-800">Gantt Timeline</h2>
          <span className="text-xs text-gray-400">
            {workstreams.length} workstream{workstreams.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={fetchWorkstreams}
          className="text-xs text-gray-500 hover:text-gray-800 transition-colors px-2 py-1 rounded hover:bg-gray-100"
        >
          Refresh
        </button>
      </div>

      {/* Gantt chart */}
      <div className="flex-1 min-h-0">
        <GanttChart
          workstreams={workstreams}
          onTaskToggle={handleTaskToggle}
          onStatusChange={handleStatusChange}
          onDragReschedule={handleDragReschedule}
          onFrdLoaded={handleFrdLoaded}
        />
      </div>
    </div>
  )
}
