'use client'

import { useState, useCallback } from 'react'
import type { Workstream, WorkstreamTask } from './types'

interface AccordionDetailProps {
  workstream: Workstream
  onTaskToggle: (taskId: string, newStatus: 'todo' | 'done') => void
}

export function AccordionDetail({ workstream, onTaskToggle }: AccordionDetailProps) {
  const doneTasks = workstream.subTasks.filter(t => t.status === 'done').length
  const totalTasks = workstream.subTasks.length
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg mx-2 mb-2 overflow-hidden shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* Sub-tasks */}
        <div className="p-3">
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Sub-tasks ({doneTasks}/{totalTasks})
          </h4>
          {workstream.subTasks.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No sub-tasks yet</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {workstream.subTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={onTaskToggle}
                />
              ))}
            </div>
          )}
        </div>

        {/* FRD Preview */}
        <div className="p-3">
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            FRD
          </h4>
          {workstream.frdContent ? (
            <div className="text-xs text-gray-700 max-h-40 overflow-y-auto prose prose-xs">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(workstream.frdContent) }} />
            </div>
          ) : workstream.frdPath ? (
            <p className="text-xs text-gray-400 italic">FRD linked but not yet cached</p>
          ) : (
            <p className="text-xs text-gray-400 italic">No FRD linked</p>
          )}
        </div>

        {/* Meetings + Progress */}
        <div className="p-3">
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Meetings
          </h4>
          {workstream.meetings.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No meetings linked</p>
          ) : (
            <div className="space-y-1.5 max-h-28 overflow-y-auto">
              {workstream.meetings.map(m => (
                <div key={m.id} className="flex items-start gap-1.5 text-xs">
                  <span className="text-gray-400 shrink-0">
                    {new Date(m.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-gray-700 truncate">{m.title}</span>
                  {m.meetLink && (
                    <a
                      href={m.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline shrink-0"
                    >
                      Join
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          <div className="mt-3 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500 font-medium">Progress</span>
              <span className="text-[10px] text-gray-700 font-semibold">{progressPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: workstream.color || '#6b7280',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, onToggle }: { task: WorkstreamTask; onToggle: (id: string, status: 'todo' | 'done') => void }) {
  const [optimistic, setOptimistic] = useState(task.status)
  const isDone = optimistic === 'done'

  const handleToggle = useCallback(() => {
    const newStatus = isDone ? 'todo' : 'done'
    setOptimistic(newStatus)
    onToggle(task.id, newStatus)
  }, [isDone, task.id, onToggle])

  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={isDone}
        onChange={handleToggle}
        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-1 focus:ring-blue-500"
      />
      <span className={`text-xs truncate ${isDone ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
        {task.title}
      </span>
      {task.assigneeId && (
        <span className="text-[9px] text-gray-400 shrink-0">@{task.assigneeId}</span>
      )}
    </label>
  )
}

// Very simple markdown to HTML (headers, bold, lists)
function simpleMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-gray-800 mt-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-gray-800 mt-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-gray-900 mt-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-3">$1</li>')
    .replace(/\n/g, '<br/>')
}
