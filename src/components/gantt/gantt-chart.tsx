'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { differenceInDays, startOfDay, eachDayOfInterval, isWeekend, addDays, format } from 'date-fns'
import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { TimeAxis } from './time-axis'
import { ChevronBar } from './chevron-bar'
import { AccordionDetail } from './accordion-detail'
import { VerticalMarker } from './today-marker'
import type { Workstream, GanttRange, PipelineStepKey } from './types'

const PIPELINE_STEP_ORDER: PipelineStepKey[] = [
  'spec', 'design_screens', 'plan', 'work', 'review',
  'compound', 'merge_pr', 'dev_feedback', 'merged',
  'qa_testing', 'lessons_learned',
]

const STEP_LABELS: Record<string, string> = {
  spec: 'SPEC', design_screens: 'DESIGN', plan: 'PLAN', work: 'WORK',
  review: 'REVIEW', compound: 'COMPOUND', merge_pr: 'PR READY',
  dev_feedback: 'DEV REVIEW', merged: 'MERGING', qa_testing: 'QA',
  lessons_learned: 'LESSONS',
}

const COMPLETED_STEP_STATUSES = new Set([
  'ready', 'complete', 'pass', 'submitted', 'approved', 'closed', 'dev-ready', 'pr_merged',
])

function getPipelineStepLabel(workstream: Workstream): string {
  const pipeline = workstream.pipeline
  if (!pipeline) return 'TODO'

  // Find the first non-completed step
  let lastCompleted: PipelineStepKey | null = null
  for (const step of PIPELINE_STEP_ORDER) {
    const s = pipeline[step]
    if (s && COMPLETED_STEP_STATUSES.has(s.status)) {
      lastCompleted = step
    } else if (s && s.status && s.status !== 'not_started') {
      // Currently in-progress step
      return STEP_LABELS[step] || step.toUpperCase()
    } else {
      break
    }
  }

  if (lastCompleted) {
    const idx = PIPELINE_STEP_ORDER.indexOf(lastCompleted)
    if (idx === PIPELINE_STEP_ORDER.length - 1) return 'DONE'
    const nextStep = PIPELINE_STEP_ORDER[idx + 1]
    return STEP_LABELS[nextStep] || nextStep.toUpperCase()
  }

  return 'SPEC'
}

function getPipelineStepColor(label: string): string {
  const colors: Record<string, string> = {
    'SPEC': 'bg-purple-100 text-purple-700',
    'DESIGN': 'bg-pink-100 text-pink-700',
    'PLAN': 'bg-amber-100 text-amber-700',
    'WORK': 'bg-amber-100 text-amber-700',
    'REVIEW': 'bg-amber-100 text-amber-700',
    'COMPOUND': 'bg-amber-100 text-amber-700',
    'PR READY': 'bg-green-100 text-green-700',
    'DEV REVIEW': 'bg-red-100 text-red-700',
    'MERGING': 'bg-green-100 text-green-700',
    'QA': 'bg-cyan-100 text-cyan-700',
    'LESSONS': 'bg-purple-100 text-purple-700',
    'DONE': 'bg-green-100 text-green-700',
    'TODO': 'bg-gray-200 text-gray-600',
  }
  return colors[label] || 'bg-gray-200 text-gray-600'
}

interface GanttChartProps {
  workstreams: Workstream[]
  onTaskToggle: (taskId: string, newStatus: 'todo' | 'done') => void
  onStatusChange?: (workstreamId: string, newStatus: string) => void
  onDragReschedule?: (workstreamId: string, newStart: string, newEnd: string) => void
}

const LABEL_WIDTH = 220
const DAY_WIDTH = 36
const ROW_HEIGHT = 48
const DEADLINE = new Date(2026, 3, 2) // April 2, 2026

// Custom modifier: restrict to horizontal axis (inline, no @dnd-kit/modifiers needed)
const horizontalOnly: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
})

// Toast state (module-level for simplicity)
let toastTimeout: ReturnType<typeof setTimeout> | null = null

export function GanttChart({ workstreams, onTaskToggle, onStatusChange, onDragReschedule }: GanttChartProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Show toast helper
  const showToast = useCallback((msg: string) => {
    if (toastTimeout) clearTimeout(toastTimeout)
    setToast(msg)
    toastTimeout = setTimeout(() => setToast(null), 3000)
  }, [])

  // Pointer sensor with activation distance to distinguish click from drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // must move 8px before dragging starts
      },
    })
  )

  // Calculate range from data
  const range: GanttRange = useMemo(() => {
    if (workstreams.length === 0) {
      return { start: new Date(2026, 2, 9), end: new Date(2026, 3, 5) }
    }
    const dates = workstreams.flatMap(ws => [new Date(ws.startDate), new Date(ws.endDate)])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    return {
      start: startOfDay(addDays(minDate, -3)),
      end: startOfDay(addDays(maxDate, 7)),
    }
  }, [workstreams])

  const totalDays = differenceInDays(range.end, range.start) + 1
  const timelineWidth = totalDays * DAY_WIDTH
  const days = eachDayOfInterval({ start: range.start, end: range.end })

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const togglePhaseCollapse = useCallback((phaseId: string) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phaseId)) {
        next.delete(phaseId)
      } else {
        next.add(phaseId)
      }
      return next
    })
  }, [])

  const phases = workstreams.filter(ws => ws.category === 'phase')
  const scopes = workstreams.filter(ws => ws.category === 'scope')

  // Group scopes by parent phase
  const scopesByPhase = useMemo(() => {
    const map = new Map<string, typeof scopes>()
    for (const scope of scopes) {
      const parentId = scope.parentId || '_unassigned'
      const arr = map.get(parentId) || []
      arr.push(scope)
      map.set(parentId, arr)
    }
    return map
  }, [scopes])

  // Scroll to today on mount
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const todayOffset = differenceInDays(startOfDay(new Date()), startOfDay(range.start))
    if (todayOffset > 0) {
      const scrollTo = Math.max(0, (todayOffset * DAY_WIDTH) - container.clientWidth / 4)
      container.scrollLeft = scrollTo
    }
  }, [range.start])

  const getContentHeight = () => {
    let h = 0
    const EXPANDED_ESTIMATE = 300 // rough estimate for pipeline; actual height is auto
    for (const phase of phases) {
      h += 32 // phase group header
      h += ROW_HEIGHT // phase row
      if (expandedIds.has(phase.id)) h += EXPANDED_ESTIMATE
      if (!collapsedPhases.has(phase.id)) {
        const childScopes = scopesByPhase.get(phase.id) || []
        if (childScopes.length > 0) {
          for (const scope of childScopes) {
            h += ROW_HEIGHT
            if (expandedIds.has(scope.id)) h += EXPANDED_ESTIMATE
          }
        }
      }
    }
    // Unassigned scopes
    const unassigned = scopesByPhase.get('_unassigned') || []
    if (unassigned.length > 0) {
      h += 32
      for (const ws of unassigned) {
        h += ROW_HEIGHT
        if (expandedIds.has(ws.id)) h += EXPANDED_ESTIMATE
      }
    }
    return Math.max(h, 400)
  }

  const statusCycle = ['not_started', 'in_progress', 'blocked', 'done']

  const handleStatusClick = useCallback((ws: Workstream, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onStatusChange) return
    const currentIdx = statusCycle.indexOf(ws.status)
    const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length]
    onStatusChange(ws.id, nextStatus)
  }, [onStatusChange])

  // --- Drag handlers ---
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
    setDragDeltaX(0)
  }, [])

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    // Snap to day grid
    const snappedDays = Math.round(event.delta.x / DAY_WIDTH)
    setDragDeltaX(snappedDays * DAY_WIDTH)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const id = event.active.id as string
    const deltaPixels = event.delta.x
    const deltaDays = Math.round(deltaPixels / DAY_WIDTH)

    setActiveDragId(null)
    setDragDeltaX(0)

    if (deltaDays === 0 || !onDragReschedule) return

    // Find workstream and calculate new dates
    const ws = workstreams.find(w => w.id === id)
    if (!ws) return

    const newStart = addDays(new Date(ws.startDate), deltaDays)
    const newEnd = addDays(new Date(ws.endDate), deltaDays)

    const newStartStr = format(startOfDay(newStart), 'yyyy-MM-dd')
    const newEndStr = format(startOfDay(newEnd), 'yyyy-MM-dd')

    showToast(`Moved "${ws.name}" → ${format(newStart, 'MMM d')} – ${format(newEnd, 'MMM d')}`)
    onDragReschedule(id, newStartStr, newEndStr)
  }, [workstreams, onDragReschedule, showToast])

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null)
    setDragDeltaX(0)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      modifiers={[horizontalOnly]}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col h-full bg-gray-50/50 relative">
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Label column (fixed left) */}
          <div className="shrink-0 border-r border-gray-200 bg-white overflow-y-auto" style={{ width: LABEL_WIDTH }}>
            <div className="h-[52px] border-b border-gray-200 flex items-end px-3 pb-1">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Workstream</span>
            </div>

            {phases.map(phase => {
              const childScopes = scopesByPhase.get(phase.id) || []
              const isPhaseCollapsed = collapsedPhases.has(phase.id)
              return (
                <div key={phase.id}>
                  {/* Phase header with scope count + collapse toggle */}
                  <div
                    className="h-8 flex items-center justify-between px-3 bg-red-50/50 border-b border-gray-100 cursor-pointer hover:bg-red-50"
                    onClick={() => togglePhaseCollapse(phase.id)}
                  >
                    <div className="flex items-center gap-1.5">
                      <svg
                        className={`w-2.5 h-2.5 text-red-400 transition-transform duration-150 ${isPhaseCollapsed ? '' : 'rotate-90'}`}
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path d="M6 3l5 5-5 5V3z" />
                      </svg>
                      <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">{phase.name}</span>
                    </div>
                    {childScopes.length > 0 && (
                      <span className="text-[9px] font-semibold text-red-400 bg-red-100 px-1.5 py-0.5 rounded-full">
                        {childScopes.length} scope{childScopes.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <WorkstreamLabel
                    workstream={phase}
                    isExpanded={expandedIds.has(phase.id)}
                    onToggle={() => toggleExpand(phase.id)}
                    onStatusClick={(e) => handleStatusClick(phase, e)}
                  />
                  {/* Child scopes under this phase — hidden when phase collapsed */}
                  {!isPhaseCollapsed && childScopes.length > 0 && (
                    <div className="border-l-2 border-red-200 ml-4">
                      {childScopes.map(ws => (
                        <WorkstreamLabel
                          key={ws.id}
                          workstream={ws}
                          isExpanded={expandedIds.has(ws.id)}
                          onToggle={() => toggleExpand(ws.id)}
                          onStatusClick={(e) => handleStatusClick(ws, e)}
                          isChild
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Unassigned scopes (no parent phase) */}
            {(scopesByPhase.get('_unassigned') || []).length > 0 && (
              <>
                <div className="h-8 flex items-center px-3 bg-blue-50/50 border-b border-gray-100">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Other Scopes</span>
                </div>
                {(scopesByPhase.get('_unassigned') || []).map(ws => (
                  <WorkstreamLabel
                    key={ws.id}
                    workstream={ws}
                    isExpanded={expandedIds.has(ws.id)}
                    onToggle={() => toggleExpand(ws.id)}
                    onStatusClick={(e) => handleStatusClick(ws, e)}
                  />
                ))}
              </>
            )}
          </div>

          {/* Timeline area (scrollable horizontally) */}
          <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
            <div className="relative" style={{ width: timelineWidth, minHeight: '100%' }}>
              <TimeAxis range={range} dayWidth={DAY_WIDTH} deadlineDate={DEADLINE} />

              <div className="relative" ref={timelineRef}>
                {/* Weekend stripes */}
                {days.map((day, i) => {
                  if (!isWeekend(day)) return null
                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full bg-gray-50/80"
                      style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                    />
                  )
                })}

                {/* Vertical markers */}
                <VerticalMarker
                  range={range}
                  dayWidth={DAY_WIDTH}
                  date={new Date()}
                  label="TODAY"
                  color="#2563eb"
                  height={getContentHeight()}
                />
                <VerticalMarker
                  range={range}
                  dayWidth={DAY_WIDTH}
                  date={DEADLINE}
                  label="DEADLINE"
                  color="#dc2626"
                  height={getContentHeight()}
                />

                {/* Phase rows with child scopes */}
                {phases.map(phase => {
                  const childScopes = scopesByPhase.get(phase.id) || []
                  const isPhaseCollapsed = collapsedPhases.has(phase.id)
                  return (
                    <div key={phase.id}>
                      <div className="h-8" />
                      <WorkstreamRow
                        workstream={phase}
                        range={range}
                        dayWidth={DAY_WIDTH}
                        isFirst
                        isExpanded={expandedIds.has(phase.id)}
                        onToggle={() => toggleExpand(phase.id)}
                        onTaskToggle={onTaskToggle}
                                                isDragging={activeDragId === phase.id}
                        dragDeltaX={activeDragId === phase.id ? dragDeltaX : 0}
                      />
                      {!isPhaseCollapsed && childScopes.map((ws, idx) => (
                        <WorkstreamRow
                          key={ws.id}
                          workstream={ws}
                          range={range}
                          dayWidth={DAY_WIDTH}
                          isFirst={idx === 0}
                          isExpanded={expandedIds.has(ws.id)}
                          onToggle={() => toggleExpand(ws.id)}
                          onTaskToggle={onTaskToggle}
                                                    isDragging={activeDragId === ws.id}
                          dragDeltaX={activeDragId === ws.id ? dragDeltaX : 0}
                        />
                      ))}
                    </div>
                  )
                })}

                {/* Unassigned scopes */}
                {(scopesByPhase.get('_unassigned') || []).length > 0 && (
                  <>
                    <div className="h-8" />
                    {(scopesByPhase.get('_unassigned') || []).map((ws, idx) => (
                      <WorkstreamRow
                        key={ws.id}
                        workstream={ws}
                        range={range}
                        dayWidth={DAY_WIDTH}
                        isFirst={idx === 0}
                        isExpanded={expandedIds.has(ws.id)}
                        onToggle={() => toggleExpand(ws.id)}
                        onTaskToggle={onTaskToggle}
                                                isDragging={activeDragId === ws.id}
                        dragDeltaX={activeDragId === ws.id ? dragDeltaX : 0}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Toast notification */}
        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-lg">
              {toast}
            </div>
          </div>
        )}
      </div>
    </DndContext>
  )
}

function WorkstreamLabel({
  workstream,
  isExpanded,
  onToggle,
  onStatusClick,
  isChild,
}: {
  workstream: Workstream
  isExpanded: boolean
  onToggle: () => void
  onStatusClick: (e: React.MouseEvent) => void
  isChild?: boolean
}) {
  const isScope = workstream.category === 'scope'
  const pipelineLabel = isScope ? getPipelineStepLabel(workstream) : null
  const statusColors: Record<string, string> = {
    not_started: 'bg-gray-200 text-gray-600',
    in_progress: 'bg-blue-100 text-blue-700',
    blocked: 'bg-red-100 text-red-700',
    done: 'bg-green-100 text-green-700',
  }

  return (
    <>
      <div
        className={`flex items-center gap-2 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
          isExpanded ? 'bg-gray-50' : ''
        } ${isChild ? 'bg-blue-50/30' : ''}`}
        style={{ height: ROW_HEIGHT, paddingLeft: isChild ? 24 : 12, paddingRight: 12 }}
        onClick={onToggle}
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-150 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6 3l5 5-5 5V3z" />
        </svg>

        <div
          className={`shrink-0 rounded-full ${isChild ? 'w-2 h-2' : 'w-2.5 h-2.5'}`}
          style={{ backgroundColor: workstream.color || '#6b7280' }}
        />

        <span className={`truncate flex-1 ${isChild ? 'text-[11px] font-medium text-gray-700' : 'text-xs font-medium text-gray-800'}`}>
          {workstream.name}
        </span>

        {/* Assignee badge in label */}
        {workstream.assigneeId && (
          <span className="text-[9px] text-gray-400 shrink-0">
            @{workstream.assigneeId}
          </span>
        )}

        <button
          onClick={onStatusClick}
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
            isScope && pipelineLabel
              ? getPipelineStepColor(pipelineLabel)
              : statusColors[workstream.status] || statusColors.not_started
          }`}
          title={isScope ? `Pipeline: ${pipelineLabel}` : 'Click to cycle status'}
        >
          {isScope && pipelineLabel
            ? pipelineLabel
            : workstream.status === 'not_started' ? 'TODO'
            : workstream.status === 'in_progress' ? 'WIP'
            : workstream.status === 'blocked' ? 'BLOCKED' : 'DONE'}
        </button>
      </div>

      {isExpanded && (
        <div className="border-b border-gray-100" />
      )}
    </>
  )
}

function WorkstreamRow({
  workstream,
  range,
  dayWidth,
  isFirst,
  isExpanded,
  onToggle,
  onTaskToggle,
  isDragging,
  dragDeltaX,
}: {
  workstream: Workstream
  range: GanttRange
  dayWidth: number
  isFirst: boolean
  isExpanded: boolean
  onToggle: () => void
  onTaskToggle: (taskId: string, newStatus: 'todo' | 'done') => void
  isDragging: boolean
  dragDeltaX: number
}) {
  const startOffset = differenceInDays(
    startOfDay(new Date(workstream.startDate)),
    startOfDay(range.start)
  )
  const duration = differenceInDays(
    startOfDay(new Date(workstream.endDate)),
    startOfDay(new Date(workstream.startDate))
  ) + 1

  const left = Math.max(0, startOffset * dayWidth)
  const width = duration * dayWidth

  return (
    <>
      <div
        className={`relative border-b border-gray-100 transition-colors ${
          isDragging ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'
        }`}
        style={{ height: ROW_HEIGHT }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left }}
        >
          <ChevronBar
            workstream={workstream}
            width={width}
            isFirst={isFirst}
            onClick={onToggle}
            isExpanded={isExpanded}
            dragDeltaX={isDragging ? dragDeltaX : 0}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="relative">
          <div className="px-2 pb-2">
            <AccordionDetail workstream={workstream} onTaskToggle={onTaskToggle} />
          </div>
        </div>
      )}
    </>
  )
}
