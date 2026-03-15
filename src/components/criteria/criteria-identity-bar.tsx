'use client'

import { ASSIGNEE_OPTIONS } from './types'

interface Props {
  activeUser: string
  onUserChange: (user: string) => void
}

export function CriteriaIdentityBar({ activeUser, onUserChange }: Props) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">Editing as:</span>
      <select
        value={activeUser}
        onChange={e => onUserChange(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Select name...</option>
        {ASSIGNEE_OPTIONS.filter(a => a.value).map(a => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      {!activeUser && (
        <span className="text-amber-600 text-xs">Select your name to edit</span>
      )}
    </div>
  )
}
