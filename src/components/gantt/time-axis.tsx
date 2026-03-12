'use client'

import { eachDayOfInterval, format, isToday, isWeekend, isSameDay } from 'date-fns'
import type { GanttRange } from './types'

interface TimeAxisProps {
  range: GanttRange
  dayWidth: number
  deadlineDate: Date
}

export function TimeAxis({ range, dayWidth, deadlineDate }: TimeAxisProps) {
  const days = eachDayOfInterval({ start: range.start, end: range.end })

  // Group by week for top-level headers
  const weeks: { label: string; span: number; startIdx: number }[] = []
  let currentWeek = ''
  let currentSpan = 0
  let currentStart = 0

  days.forEach((day, idx) => {
    const weekLabel = format(day, "'W'w MMM")
    if (weekLabel !== currentWeek) {
      if (currentWeek) {
        weeks.push({ label: currentWeek, span: currentSpan, startIdx: currentStart })
      }
      currentWeek = weekLabel
      currentSpan = 1
      currentStart = idx
    } else {
      currentSpan++
    }
  })
  if (currentWeek) {
    weeks.push({ label: currentWeek, span: currentSpan, startIdx: currentStart })
  }

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
      {/* Week row */}
      <div className="flex border-b border-gray-100" style={{ height: 24 }}>
        {weeks.map((week, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-[10px] font-medium text-gray-500 border-r border-gray-100"
            style={{ width: week.span * dayWidth }}
          >
            {week.label}
          </div>
        ))}
      </div>

      {/* Day row */}
      <div className="flex" style={{ height: 28 }}>
        {days.map((day, i) => {
          const today = isToday(day)
          const weekend = isWeekend(day)
          const isDeadline = isSameDay(day, deadlineDate)

          return (
            <div
              key={i}
              className={`flex flex-col items-center justify-center border-r text-[10px] ${
                today
                  ? 'bg-blue-50 text-blue-700 font-bold border-blue-200'
                  : isDeadline
                    ? 'bg-red-50 text-red-700 font-bold border-red-200'
                    : weekend
                      ? 'bg-gray-50 text-gray-400 border-gray-100'
                      : 'text-gray-600 border-gray-100'
              }`}
              style={{ width: dayWidth }}
            >
              <span>{format(day, 'EEE')}</span>
              <span className="text-[9px]">{format(day, 'd')}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
