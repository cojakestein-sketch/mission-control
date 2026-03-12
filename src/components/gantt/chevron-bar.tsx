'use client'

import { useState, useCallback, useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { STATUS_COLORS } from './types'
import type { Workstream } from './types'

interface ChevronBarProps {
  workstream: Workstream
  width: number
  isFirst?: boolean
  onClick?: () => void
  isExpanded?: boolean
  isDragDisabled?: boolean
  dragDeltaX?: number // live drag offset from DndContext
}

// Chevron clip-path polygons
const CHEVRON_CLIP = `polygon(
  0% 0%,
  calc(100% - 14px) 0%,
  100% 50%,
  calc(100% - 14px) 100%,
  0% 100%,
  14px 50%
)`

const CHEVRON_FIRST = `polygon(
  0% 0%,
  calc(100% - 14px) 0%,
  100% 50%,
  calc(100% - 14px) 100%,
  0% 100%
)`

const TEAM_MEMBERS = [
  { id: 'asif', name: 'Asif', color: '#2563eb' },
  { id: 'nadeem', name: 'Nadeem', color: '#059669' },
  { id: 'muneeb', name: 'Muneeb', color: '#d97706' },
  { id: 'krisna', name: 'Krisna', color: '#7c3aed' },
  { id: 'andreas', name: 'Andreas', color: '#0891b2' },
]

export function ChevronBar({ workstream, width, isFirst, onClick, isExpanded, isDragDisabled, dragDeltaX }: ChevronBarProps) {
  const color = workstream.color || '#6b7280'
  const statusColors = STATUS_COLORS[workstream.status]
  const isBlocked = workstream.status === 'blocked'
  const isDone = workstream.status === 'done'
  const [showAssignee, setShowAssignee] = useState(false)
  const assigneeRef = useRef<HTMLDivElement>(null)

  const minWidth = 60
  const displayWidth = Math.max(width, minWidth)

  // dnd-kit draggable
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: workstream.id,
    disabled: isDragDisabled,
    data: { workstream },
  })

  // Use dragDeltaX from parent (snapped) when actively dragging, else 0
  const translateX = isDragging ? (dragDeltaX ?? transform?.x ?? 0) : 0

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Don't toggle if we just finished dragging
    if (isDragging) return
    onClick?.()
  }, [isDragging, onClick])

  const handleAssigneeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowAssignee(prev => !prev)
  }, [])

  return (
    <div
      ref={setNodeRef}
      className={`relative group focus:outline-none ${isDragging ? 'z-30 opacity-80' : ''}`}
      style={{
        width: displayWidth,
        height: 36,
        transform: `translateX(${translateX}px)`,
        transition: isDragging ? 'none' : 'transform 200ms ease',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      {...attributes}
      {...listeners}
    >
      {/* Click target (center area, not edges) */}
      <div
        className="absolute inset-0"
        style={{ left: 20, right: 20 }}
        onClick={handleClick}
      />

      {/* Main chevron shape */}
      <div
        className="absolute inset-0 transition-all duration-150"
        style={{
          clipPath: isFirst ? CHEVRON_FIRST : CHEVRON_CLIP,
          backgroundColor: isDone ? '#d1d5db' : color,
          opacity: isDone ? 0.6 : workstream.status === 'not_started' ? 0.7 : 1,
          border: isBlocked ? '2px solid #ef4444' : undefined,
        }}
      >
        {/* Progress overlay */}
        {workstream.progress > 0 && workstream.progress < 1 && (
          <div
            className="absolute inset-0"
            style={{
              clipPath: isFirst ? CHEVRON_FIRST : CHEVRON_CLIP,
              background: `linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.2) ${workstream.progress * 100}%, transparent ${workstream.progress * 100}%)`,
            }}
          />
        )}
      </div>

      {/* Text content */}
      <div className="absolute inset-0 flex items-center px-5 gap-1.5 overflow-hidden pointer-events-none">
        <span
          className="text-[11px] font-semibold truncate"
          style={{ color: isDone ? '#6b7280' : '#ffffff' }}
        >
          {workstream.name}
        </span>
        {workstream.progress > 0 && (
          <span
            className="text-[9px] font-medium opacity-80 shrink-0"
            style={{ color: isDone ? '#6b7280' : '#ffffff' }}
          >
            {Math.round(workstream.progress * 100)}%
          </span>
        )}
      </div>

      {/* Assignee avatar (clickable) */}
      <div className="absolute -top-1 -left-1 pointer-events-auto" ref={assigneeRef}>
        <button
          onClick={handleAssigneeClick}
          className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm"
          style={{
            backgroundColor: workstream.assigneeId
              ? TEAM_MEMBERS.find(m => m.id === workstream.assigneeId)?.color || '#6b7280'
              : '#9ca3af',
          }}
          title={workstream.assigneeId ? `Assigned to ${workstream.assigneeId}` : 'Unassigned — click to assign'}
        >
          {workstream.assigneeId
            ? workstream.assigneeId.charAt(0).toUpperCase()
            : '?'}
        </button>

        {/* Assignee dropdown */}
        {showAssignee && (
          <AssigneeDropdown
            workstreamId={workstream.id}
            currentAssignee={workstream.assigneeId}
            onClose={() => setShowAssignee(false)}
          />
        )}
      </div>

      {/* Status badge */}
      <div
        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white"
        style={{ backgroundColor: statusColors.bg, borderColor: statusColors.border }}
        title={workstream.status.replace('_', ' ')}
      />

      {/* Expand indicator */}
      <div className="absolute right-1 bottom-0.5 pointer-events-none">
        <svg
          className={`w-3 h-3 text-white/60 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Resize handles (left/right edges) */}
      <div
        className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.4), transparent)' }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Drag to resize start date"
      />
      <div
        className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(270deg, rgba(255,255,255,0.4), transparent)' }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Drag to resize end date"
      />

      {/* Hover highlight */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
        style={{
          clipPath: isFirst ? CHEVRON_FIRST : CHEVRON_CLIP,
          backgroundColor: 'rgba(255,255,255,0.08)',
        }}
      />
    </div>
  )
}

function AssigneeDropdown({
  workstreamId,
  currentAssignee,
  onClose,
}: {
  workstreamId: string
  currentAssignee: string | null
  onClose: () => void
}) {
  const handleAssign = useCallback(async (assigneeId: string | null) => {
    onClose()
    try {
      await fetch(`/api/workstreams/${workstreamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId }),
      })
      // Parent will refresh
    } catch {
      // silent — parent refreshes periodically
    }
  }, [workstreamId, onClose])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Dropdown */}
      <div className="absolute top-6 left-0 z-50 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-xs">
        <div className="px-2 py-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
          Assign to
        </div>
        {TEAM_MEMBERS.map(member => (
          <button
            key={member.id}
            onClick={() => handleAssign(member.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 transition-colors ${
              currentAssignee === member.id ? 'bg-blue-50' : ''
            }`}
          >
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: member.color }}
            >
              {member.name.charAt(0)}
            </div>
            <span className="text-gray-700">{member.name}</span>
            {currentAssignee === member.id && (
              <svg className="w-3 h-3 text-blue-500 ml-auto" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
            )}
          </button>
        ))}
        {currentAssignee && (
          <>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => handleAssign(null)}
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 text-gray-500"
            >
              <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] text-gray-500">
                ×
              </div>
              <span>Unassign</span>
            </button>
          </>
        )}
      </div>
    </>
  )
}
