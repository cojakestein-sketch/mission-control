'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Phase {
  id: string
  name: string
  startDate: string
  targetEndDate: string
  color: string
  totalTasks: number
  completedTasks: number
  progress: number
  assignees: Array<{ name: string; avatar: string; tasksCompleted: number; tasksTotal: number }>
}

interface Scope {
  id: string
  name: string
  deepWorkDate: string | null
  deepWorkDone: boolean
  startDate: string | null
  endDate: string | null
  status: string
}

interface Recommendation {
  type: string
  scope: string
  reason: string
  suggestedDate: string
}

interface TeamMember {
  name: string
  status: 'green' | 'yellow' | 'red'
}

interface TrypsData {
  updatedAt: string
  deadline: string
  phases: Phase[]
  scopes: Scope[]
  team: TeamMember[]
  marty: {
    status: string
    lastCronRun: string
    nextCronRun: string
    pendingRecommendations: Recommendation[]
    recentActions: Array<{ time: string; action: string }>
  }
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function GanttPanel() {
  const ganttRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<TrypsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [ganttReady, setGanttReady] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tryps-data')
      if (res.ok) {
        const d = await res.json()
        setData(d)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  // Load dhtmlxGantt from CDN
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check if already loaded
    if (// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).gantt) {
      setGanttReady(true)
      return
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/dhtmlx-gantt@9.1.0/codebase/dhtmlxgantt.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/dhtmlx-gantt@9.1.0/codebase/dhtmlxgantt.js'
    script.onload = () => setGanttReady(true)
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(link)
      document.head.removeChild(script)
    }
  }, [])

  // Fetch data on mount + auto-refresh every 2 minutes
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 120000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Initialize Gantt when both library and data are ready
  useEffect(() => {
    if (!ganttReady || !data || !ganttRef.current) return

    const gantt = // eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).gantt as GanttStatic
    if (!gantt) return

    // Configure
    gantt.config.date_format = '%Y-%m-%d'
    gantt.config.scale_unit = 'day'
    gantt.config.date_scale = '%d %M'
    gantt.config.min_column_width = 30
    gantt.config.scale_height = 50
    gantt.config.row_height = 36
    gantt.config.task_height = 22
    gantt.config.readonly = true
    gantt.config.show_links = false
    gantt.config.show_progress = true
    gantt.config.open_tree_initially = true
    gantt.config.fit_tasks = true
    gantt.config.auto_scheduling = false
    gantt.config.autofit = false

    gantt.config.columns = [
      { name: 'text', label: 'Workstream', width: 200, tree: true },
      {
        name: 'progress',
        label: '%',
        width: 50,
        align: 'center',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template: (task: any) => {
          if (task.type === 'project') return ''
          return Math.round((task.progress || 0) * 100) + '%'
        },
      },
    ]

    // Set date range: March 9 → April 5
    gantt.config.start_date = new Date(2026, 2, 9)
    gantt.config.end_date = new Date(2026, 3, 5)

    // Dark theme via CSS overrides
    gantt.skin = 'material'

    // Plugins
    if (gantt.plugins) {
      gantt.plugins({ marker: true })
    }

    // Custom task rendering for assignee avatars
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gantt.templates.task_text = function (...args: any[]) {
      const task = args[2] as GanttTask
      if (task?.$custom_assignees) {
        return task.text + ' ' + task.$custom_assignees
      }
      return task?.text || ''
    }

    // Scope status indicator
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gantt.templates.task_class = function (...args: any[]) {
      const task = args[2] as GanttTask
      if (task?.$scope_status === 'session-done') return 'scope-done'
      if (task?.$scope_status === 'session-scheduled') return 'scope-scheduled'
      if (task?.$scope_status === 'not-started') return 'scope-not-started'
      return ''
    }

    // Init
    ganttRef.current.innerHTML = ''
    gantt.init(ganttRef.current)

    // Add markers
    gantt.addMarker({
      start_date: new Date(),
      css: 'today-marker',
      text: 'Today',
    })
    gantt.addMarker({
      start_date: new Date(2026, 3, 2),
      css: 'deadline-marker',
      text: 'DEADLINE',
    })

    // Build task data
    const tasks: GanttTask[] = []

    // FRD Phases group
    tasks.push({
      id: 'frd',
      text: 'FRD Phases',
      type: 'project',
      open: true,
      start_date: data.phases[0]?.startDate || '2026-03-09',
      end_date: data.deadline,
    })

    data.phases.forEach((phase) => {
      const assigneeStr = phase.assignees
        .map((a) => `${a.avatar}(${a.tasksCompleted}/${a.tasksTotal})`)
        .join(' ')

      tasks.push({
        id: phase.id,
        text: phase.name.replace(/^Phase \d+(\.\d+)?: /, ''),
        parent: 'frd',
        start_date: phase.startDate,
        end_date: phase.targetEndDate,
        progress: phase.progress,
        color: phase.color,
        $custom_assignees: assigneeStr,
      })
    })

    // Scopes of Work group
    tasks.push({
      id: 'scopes',
      text: 'Scopes of Work',
      type: 'project',
      open: true,
      start_date: '2026-03-12',
      end_date: data.deadline,
    })

    data.scopes.forEach((scope) => {
      const startDate = scope.startDate || '2026-03-20'
      const endDate = scope.endDate || addDays(startDate, 7)
      const indicator = scope.deepWorkDone ? '\u{1F7E3}' : '\u25CB'

      tasks.push({
        id: scope.id,
        text: `${indicator} ${scope.name}`,
        parent: 'scopes',
        start_date: startDate,
        end_date: endDate,
        progress: scope.deepWorkDone ? 0.1 : 0,
        color: scope.status === 'not-started' ? '#374151' : '#8b5cf6',
        $scope_status: scope.status,
      })
    })

    gantt.parse({ data: tasks, links: [] })
  }, [ganttReady, data])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading Gantt data...
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No data available. Waiting for Marty cron to populate data.json.
      </div>
    )
  }

  const deadlineDays = daysUntil(data.deadline)
  const teamArr = data.team || []
  const healthyCount = teamArr.filter(t => t.status === 'green').length
  const totalCount = teamArr.length

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          {teamArr.map((t) => (
            <span
              key={t.name}
              className={`w-3 h-3 rounded-full ${
                t.status === 'green'
                  ? 'bg-emerald-500'
                  : t.status === 'yellow'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`}
              title={`${t.name}: ${t.status}`}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            {healthyCount}/{totalCount} healthy
          </span>
        </div>
        <span className="text-xs text-muted-foreground">|</span>
        <span className={`text-xs font-medium ${deadlineDays <= 7 ? 'text-red-400' : deadlineDays <= 14 ? 'text-amber-400' : 'text-muted-foreground'}`}>
          {deadlineDays} days to deadline
        </span>
        <span className="text-xs text-muted-foreground">|</span>
        <span className="text-xs text-muted-foreground">
          Updated {formatTimeAgo(data.updatedAt)}
        </span>
        <button
          onClick={fetchData}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          title="Refresh data"
        >
          Refresh
        </button>
      </div>

      {/* Gantt chart */}
      <div className="flex-1 min-h-0">
        <style>{ganttDarkStyles}</style>
        <div ref={ganttRef} className="w-full h-full" />
      </div>

      {/* Marty Says */}
      {data.marty?.pendingRecommendations?.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-card/50">
          <div className="flex items-start gap-2">
            <span className="text-sm">&#x1F4A1;</span>
            <div>
              <span className="text-xs font-medium text-foreground">MARTY SAYS: </span>
              <span className="text-xs text-muted-foreground">
                {data.marty.pendingRecommendations[0].reason}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Dark theme CSS overrides for dhtmlxGantt
const ganttDarkStyles = `
  .gantt_container {
    background: #0a0e17 !important;
    border: none !important;
    font-family: var(--font-sans), -apple-system, sans-serif !important;
  }
  .gantt_grid, .gantt_grid_data {
    background: #111827 !important;
    border-color: #1f2937 !important;
  }
  .gantt_grid_head_cell, .gantt_scale_cell {
    background: #111827 !important;
    color: #9ca3af !important;
    border-color: #1f2937 !important;
    font-size: 11px !important;
  }
  .gantt_cell, .gantt_row {
    border-color: #1f2937 !important;
  }
  .gantt_cell {
    color: #e5e7eb !important;
    font-size: 12px !important;
  }
  .gantt_row, .gantt_task_row {
    background: #0f1729 !important;
    border-color: #1f2937 !important;
  }
  .gantt_row.odd, .gantt_task_row.odd {
    background: #111827 !important;
  }
  .gantt_task_content {
    color: #fff !important;
    font-size: 11px !important;
    font-weight: 500 !important;
  }
  .gantt_task_progress {
    background: rgba(255,255,255,0.2) !important;
  }
  .gantt_tree_icon {
    color: #9ca3af !important;
  }
  .gantt_task_line.gantt_project {
    background: transparent !important;
    border: none !important;
  }
  /* Today marker */
  .today-marker {
    background: #06b6d4 !important;
    width: 2px !important;
    opacity: 0.7;
  }
  .today-marker .gantt_marker_content {
    color: #06b6d4 !important;
    font-size: 10px !important;
    background: transparent !important;
  }
  /* Deadline marker */
  .deadline-marker {
    background: #ef4444 !important;
    width: 2px !important;
  }
  .deadline-marker .gantt_marker_content {
    color: #ef4444 !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    background: transparent !important;
  }
  /* Scope statuses */
  .scope-not-started .gantt_task_line {
    opacity: 0.4 !important;
    border: 1px dashed #6b7280 !important;
  }
  .gantt_grid_head_cell .gantt_grid_head_text {
    color: #9ca3af !important;
  }
  /* Scrollbar */
  .gantt_hor_scroll, .gantt_ver_scroll {
    background: #111827 !important;
  }
  .gantt_layout_cell {
    border-color: #1f2937 !important;
  }
  .gantt_task_line {
    border-radius: 4px !important;
  }
`

// Type declarations for dhtmlxGantt
interface GanttTask {
  id: string
  text: string
  type?: string
  parent?: string
  open?: boolean
  start_date: string
  end_date: string
  progress?: number
  color?: string
  $custom_assignees?: string
  $scope_status?: string
}

interface GanttStatic {
  config: Record<string, unknown>
  templates: Record<string, (...args: unknown[]) => string>
  skin: string
  plugins: (plugins: Record<string, boolean>) => void
  init: (el: HTMLElement) => void
  parse: (data: { data: GanttTask[]; links: unknown[] }) => void
  addMarker: (marker: { start_date: Date; css: string; text: string }) => void
}
