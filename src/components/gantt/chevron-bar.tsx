'use client'

import { STATUS_COLORS } from './types'
import type { Workstream } from './types'

interface ChevronBarProps {
  workstream: Workstream
  width: number
  isFirst?: boolean
  onClick?: () => void
  isExpanded?: boolean
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

export function ChevronBar({ workstream, width, isFirst, onClick, isExpanded }: ChevronBarProps) {
  const color = workstream.color || '#6b7280'
  const statusColors = STATUS_COLORS[workstream.status]
  const isBlocked = workstream.status === 'blocked'
  const isDone = workstream.status === 'done'

  const minWidth = 60
  const displayWidth = Math.max(width, minWidth)

  return (
    <button
      onClick={onClick}
      className="relative group cursor-pointer focus:outline-none"
      style={{ width: displayWidth, height: 36 }}
      title={`${workstream.name} (${Math.round(workstream.progress * 100)}%)`}
    >
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
      <div className="absolute inset-0 flex items-center px-5 gap-1.5 overflow-hidden">
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

      {/* Status badge */}
      <div
        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white"
        style={{ backgroundColor: statusColors.bg, borderColor: statusColors.border }}
        title={workstream.status.replace('_', ' ')}
      />

      {/* Expand indicator */}
      <div className="absolute right-1 bottom-0.5">
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

      {/* Hover highlight */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{
          clipPath: isFirst ? CHEVRON_FIRST : CHEVRON_CLIP,
          backgroundColor: 'rgba(255,255,255,0.08)',
        }}
      />
    </button>
  )
}
