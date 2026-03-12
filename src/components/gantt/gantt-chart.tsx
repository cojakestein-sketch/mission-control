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
import type { Workstream, GanttRange } from './types'

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

  const phases = workstreams.filter(ws => ws.category === 'phase')
  const scopes = workstreams.filter(ws => ws.category === 'scope')

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
    const groups = [{ items: phases }, { items: scopes }]
    for (const group of groups) {
      h += 32
      for (const ws of group.items) {
        h += ROW_HEIGHT
        if (expandedIds.has(ws.id)) {
          h += 180
        }
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

            {phases.length > 0 && (
              <>
                <div className="h-8 flex items-center px-3 bg-red-50/50 border-b border-gray-100">
                  <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Phases</span>
                </div>
                {phases.map(ws => (
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

            {scopes.length > 0 && (
              <>
                <div className="h-8 flex items-center px-3 bg-blue-50/50 border-b border-gray-100">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Scopes of Work</span>
                </div>
                {scopes.map(ws => (
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

                {/* Phase rows */}
                {phases.length > 0 && (
                  <>
                    <div className="h-8" />
                    {phases.map((ws, idx) => (
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

                {/* Scope rows */}
                {scopes.length > 0 && (
                  <>
                    <div className="h-8" />
                    {scopes.map((ws, idx) => (
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
}: {
  workstream: Workstream
  isExpanded: boolean
  onToggle: () => void
  onStatusClick: (e: React.MouseEvent) => void
}) {
  const statusColors: Record<string, string> = {
    not_started: 'bg-gray-200 text-gray-600',
    in_progress: 'bg-blue-100 text-blue-700',
    blocked: 'bg-red-100 text-red-700',
    done: 'bg-green-100 text-green-700',
  }

  return (
    <>
      <div
        className={`flex items-center gap-2 px-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
          isExpanded ? 'bg-gray-50' : ''
        }`}
        style={{ height: ROW_HEIGHT }}
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
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: workstream.color || '#6b7280' }}
        />

        <span className="text-xs font-medium text-gray-800 truncate flex-1">
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
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors[workstream.status] || statusColors.not_started}`}
          title="Click to cycle status"
        >
          {workstream.status === 'not_started' ? 'TODO' :
           workstream.status === 'in_progress' ? 'WIP' :
           workstream.status === 'blocked' ? 'BLOCKED' : 'DONE'}
        </button>
      </div>

      {isExpanded && (
        <div className="border-b border-gray-100" style={{ height: 180 }} />
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
        <div className="relative" style={{ height: 180 }}>
          <div className="absolute inset-x-2 inset-y-0 overflow-visible">
            <AccordionDetail workstream={workstream} onTaskToggle={onTaskToggle} />
          </div>
        </div>
      )}
    </>
  )
}
