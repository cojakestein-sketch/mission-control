export type PipelineStepKey =
  | 'spec' | 'frd' | 'design_screens' | 'plan' | 'work'
  | 'review' | 'compound' | 'merge_pr' | 'dev_feedback'
  | 'post_dev_fixes' | 'merge_status'

export interface ScopePipelineStep {
  id: string
  workstreamId: string
  stepKey: string
  status: string
  content: string | null
  generatedAt: string | null
  meta: Record<string, unknown> | null
  updatedAt: string
}

export interface Workstream {
  id: string
  name: string
  category: 'phase' | 'scope'
  parentId: string | null
  assigneeId: string | null
  startDate: string // ISO 8601
  endDate: string
  status: 'not_started' | 'in_progress' | 'blocked' | 'done'
  color: string | null
  frdPath: string | null
  frdContent: string | null
  specPath: string | null
  specContent: string | null
  progress: number // 0.0 - 1.0
  sortOrder: number
  deepWorkCompleted: boolean
  subTasks: WorkstreamTask[]
  meetings: WorkstreamMeeting[]
  pipeline: Record<PipelineStepKey, ScopePipelineStep | null>
}

export interface WorkstreamTask {
  id: string
  workstreamId: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  assigneeId: string | null
  dueDate: string | null
  clickupTaskId: string | null
  sortOrder: number
}

export interface WorkstreamMeeting {
  id: string
  workstreamId: string | null
  title: string
  startTime: string
  endTime: string
  attendees: string[]
  meetLink: string | null
  gcalEventId: string
}

export interface FlatRow {
  type: 'workstream' | 'subtask' | 'detail'
  id: string
  workstream?: Workstream
  task?: WorkstreamTask
  height: number
}

// Gantt timeline config
export interface GanttRange {
  start: Date
  end: Date
}

// Status colors for the light theme
export const STATUS_COLORS = {
  not_started: { bg: '#e5e7eb', text: '#6b7280', border: '#d1d5db' },
  in_progress: { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' },
  blocked: { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
  done: { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
} as const

// Workstream colors for chevrons (light-theme friendly)
export const WORKSTREAM_COLORS = [
  '#D9071C', // Tryps Red
  '#2563eb', // Blue
  '#7c3aed', // Violet
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Red
  '#0891b2', // Cyan
  '#4f46e5', // Indigo
  '#c026d3', // Fuchsia
  '#65a30d', // Lime
] as const
