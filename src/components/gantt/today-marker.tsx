'use client'

import { differenceInDays, startOfDay } from 'date-fns'
import type { GanttRange } from './types'

interface MarkerProps {
  range: GanttRange
  dayWidth: number
  date: Date
  label: string
  color: string
  height: number
}

export function VerticalMarker({ range, dayWidth, date, label, color, height }: MarkerProps) {
  const dayOffset = differenceInDays(startOfDay(date), startOfDay(range.start))
  if (dayOffset < 0) return null

  const left = dayOffset * dayWidth + dayWidth / 2

  return (
    <div
      className="absolute top-0 pointer-events-none z-10"
      style={{ left, height }}
    >
      <div
        className="w-0.5 h-full opacity-60"
        style={{ backgroundColor: color }}
      />
      <div
        className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold whitespace-nowrap px-1 py-0.5 rounded"
        style={{ color, backgroundColor: `${color}15` }}
      >
        {label}
      </div>
    </div>
  )
}
