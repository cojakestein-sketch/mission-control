'use client'

import type { ChangelogEntry } from './types'

interface Props {
  changes: ChangelogEntry[]
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function CriteriaChangelog({ changes }: Props) {
  if (changes.length === 0) {
    return (
      <div className="text-gray-400 text-sm">No changes yet</div>
    )
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Recent Changes
      </h3>
      <div className="space-y-3">
        {changes.map(change => {
          // Extract criterion short text from key
          const keyParts = change.criterionKey.split('/')
          const shortKey = keyParts.slice(0, 2).join('/')

          return (
            <div key={change.id} className="text-xs">
              <div className="text-gray-700">
                <span className="font-medium">{capitalize(change.changedBy)}</span>
                {' set '}
                <span className="text-gray-500">{change.field.replace('_', ' ')}</span>
                {' to '}
                <span className="font-medium">{change.newValue || '—'}</span>
              </div>
              <div className="text-gray-400 mt-0.5">
                {shortKey} · {formatTime(change.changedAt)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
