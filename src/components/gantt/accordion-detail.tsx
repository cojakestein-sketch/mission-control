'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Workstream, WorkstreamTask } from './types'

interface AccordionDetailProps {
  workstream: Workstream
  onTaskToggle: (taskId: string, newStatus: 'todo' | 'done') => void
  onFrdLoaded?: (workstreamId: string, content: string) => void
}

export function AccordionDetail({ workstream, onTaskToggle, onFrdLoaded }: AccordionDetailProps) {
  const doneTasks = workstream.subTasks.filter(t => t.status === 'done').length
  const totalTasks = workstream.subTasks.length
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const [frdLoading, setFrdLoading] = useState(false)
  const [frdError, setFrdError] = useState<string | null>(null)

  // Fetch FRD on mount if path exists but content is empty
  useEffect(() => {
    if (workstream.frdPath && !workstream.frdContent && !frdLoading) {
      setFrdLoading(true)
      setFrdError(null)
      fetch(`/api/frd/${workstream.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.frdContent) {
            onFrdLoaded?.(workstream.id, data.frdContent)
          }
        })
        .catch(err => setFrdError(String(err)))
        .finally(() => setFrdLoading(false))
    }
  }, [workstream.id, workstream.frdPath, workstream.frdContent, frdLoading, onFrdLoaded])

  // GitHub "Create FRD" URL
  const frdRepo = 'cojakestein-sketch/tryps-docs'
  const frdFileName = `docs/frds/${workstream.id}.md`
  const frdTemplate = encodeURIComponent(
    `# ${workstream.name} — Functional Requirements\n\n## Overview\n[What is this workstream about?]\n\n## Requirements\n- [ ] Requirement 1\n- [ ] Requirement 2\n\n## Design\n[Links to Figma, mockups, etc.]\n\n## Notes\n[Any additional context]\n`
  )
  const createFrdUrl = `https://github.com/${frdRepo}/new/main?filename=${frdFileName}&value=${frdTemplate}`

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
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              FRD
            </h4>
            {workstream.frdContent && workstream.frdPath && (
              <a
                href={`https://github.com/${frdRepo}/blob/main/${frdFileName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] text-blue-500 hover:underline"
              >
                View on GitHub
              </a>
            )}
          </div>
          {frdLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Fetching FRD...
            </div>
          ) : frdError ? (
            <p className="text-xs text-red-400 italic">Failed to load FRD</p>
          ) : workstream.frdContent ? (
            <div className="text-xs text-gray-700 max-h-40 overflow-y-auto prose prose-xs">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(workstream.frdContent) }} />
            </div>
          ) : workstream.frdPath ? (
            <div className="text-center py-3">
              <p className="text-xs text-gray-400 mb-2">FRD not created yet</p>
              <a
                href={createFrdUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
                </svg>
                Create FRD
              </a>
            </div>
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
