'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { differenceInDays, startOfDay, eachDayOfInterval, isWeekend, addDays } from 'date-fns'
import { TimeAxis } from './time-axis'
import { ChevronBar } from './chevron-bar'
import { AccordionDetail } from './accordion-detail'
import { VerticalMarker } from './today-marker'
import type { Workstream, GanttRange } from './types'

interface GanttChartProps {
  workstreams: Workstream[]
  onTaskToggle: (taskId: string, newStatus: 'todo' | 'done') => void
  onStatusChange?: (workstreamId: string, newStatus: string) => void
}

const LABEL_WIDTH = 220
const DAY_WIDTH = 36
const ROW_HEIGHT = 48
const DEADLINE = new Date(2026, 3, 2) // April 2, 2026

export function GanttChart({ workstreams, onTaskToggle, onStatusChange }: GanttChartProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Calculate range from data (or default: March 9 - April 5)
  const range: GanttRange = useMemo(() => {
    if (workstreams.length === 0) {
      return { start: new Date(2026, 2, 9), end: new Date(2026, 3, 5) }
    }
    const dates = workstreams.flatMap(ws => [new Date(ws.startDate), new Date(ws.endDate)])
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
    // Add padding: 3 days before, 7 days after
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

  // Group workstreams by category
  const phases = workstreams.filter(ws => ws.category === 'phase')
  const scopes = workstreams.filter(ws => ws.category === 'scope')

  // Scroll to today on mount
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const todayOffset = differenceInDays(startOfDay(new Date()), startOfDay(range.start))
    if (todayOffset > 0) {
      // Scroll so today is about 1/4 from the left
      const scrollTo = Math.max(0, (todayOffset * DAY_WIDTH) - container.clientWidth / 4)
      container.scrollLeft = scrollTo
    }
  }, [range.start])

  // Calculate total content height for markers
  const getContentHeight = () => {
    let h = 0
    const groups = [{ label: 'Phases', items: phases }, { label: 'Scopes', items: scopes }]
    for (const group of groups) {
      h += 32 // group header
      for (const ws of group.items) {
        h += ROW_HEIGHT
        if (expandedIds.has(ws.id)) {
          h += 180 // accordion detail estimate
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

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Label column (fixed left) */}
        <div className="shrink-0 border-r border-gray-200 bg-white overflow-y-auto" style={{ width: LABEL_WIDTH }}>
          {/* Header spacer */}
          <div className="h-[52px] border-b border-gray-200 flex items-end px-3 pb-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Workstream</span>
          </div>

          {/* Phase group */}
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

          {/* Scope group */}
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
            {/* Time axis header (sticky) */}
            <TimeAxis range={range} dayWidth={DAY_WIDTH} deadlineDate={DEADLINE} />

            {/* Grid body */}
            <div className="relative" ref={timelineRef}>
              {/* Weekend stripe backgrounds */}
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
                  <div className="h-8" /> {/* Group header spacer */}
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
                    />
                  ))}
                </>
              )}

              {/* Scope rows */}
              {scopes.length > 0 && (
                <>
                  <div className="h-8" /> {/* Group header spacer */}
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
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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
        {/* Expand chevron */}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-150 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6 3l5 5-5 5V3z" />
        </svg>

        {/* Color dot */}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: workstream.color || '#6b7280' }}
        />

        {/* Name */}
        <span className="text-xs font-medium text-gray-800 truncate flex-1">
          {workstream.name}
        </span>

        {/* Status badge */}
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

      {/* Accordion detail (in label column — takes full row height) */}
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
}: {
  workstream: Workstream
  range: GanttRange
  dayWidth: number
  isFirst: boolean
  isExpanded: boolean
  onToggle: () => void
  onTaskToggle: (taskId: string, newStatus: 'todo' | 'done') => void
}) {
  const startOffset = differenceInDays(
    startOfDay(new Date(workstream.startDate)),
    startOfDay(range.start)
  )
  const duration = differenceInDays(
    startOfDay(new Date(workstream.endDate)),
    startOfDay(new Date(workstream.startDate))
  ) + 1 // inclusive

  const left = Math.max(0, startOffset * dayWidth)
  const width = duration * dayWidth

  return (
    <>
      <div
        className="relative border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
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
          />
        </div>
      </div>

      {/* Accordion detail row */}
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
