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
        className="border border-gray-200 rounded-lg px-2.5 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
      >
        {ASSIGNEE_OPTIONS.filter(a => a.value).map(a => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  )
}
