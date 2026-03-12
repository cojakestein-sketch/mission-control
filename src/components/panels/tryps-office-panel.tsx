'use client'

import { useEffect, useState, useCallback } from 'react'

interface TeamMember {
  name: string
  role: string
  github: string | null
  status: 'green' | 'yellow' | 'red'
  currentTask: string | null
  currentTaskStatus: string | null
  daysInStatus: number
  flags: string[]
}

interface MartyData {
  status: string
  lastCronRun: string
  nextCronRun: string
  recentActions: Array<{ time: string; action: string }>
}

interface TrypsData {
  updatedAt: string
  team: TeamMember[]
  marty: MartyData
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STATUS_MAP = {
  green: { label: 'Shipping', color: 'bg-emerald-500', pulse: true, textColor: 'text-emerald-400' },
  yellow: { label: 'Reviewing', color: 'bg-amber-500', pulse: false, textColor: 'text-amber-400' },
  red: { label: 'Stuck', color: 'bg-red-500', pulse: false, textColor: 'text-red-400' },
  offline: { label: 'Offline', color: 'bg-gray-500', pulse: false, textColor: 'text-gray-400' },
} as const

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function AvatarCard({ member }: { member: TeamMember }) {
  const status = STATUS_MAP[member.status]

  return (
    <div className="flex flex-col items-center gap-3 p-5 bg-[#111827] border border-[#1f2937] rounded-xl hover:border-[#06b6d4] transition-all group">
      {/* Avatar with status ring */}
      <div className="relative">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white bg-gradient-to-br ${
          member.status === 'green' ? 'from-emerald-600 to-emerald-800' :
          member.status === 'yellow' ? 'from-amber-600 to-amber-800' :
          'from-red-600 to-red-800'
        }`}>
          {getInitials(member.name)}
        </div>
        <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#111827] ${status.color} ${status.pulse ? 'animate-pulse' : ''}`} />
      </div>

      {/* Name + role */}
      <div className="text-center">
        <div className="text-sm font-semibold text-[#f9fafb]">{member.name}</div>
        <div className="text-[11px] text-[#6b7280]">{member.role}</div>
      </div>

      {/* Status badge */}
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${status.textColor} bg-white/5`}>
        {status.label}
      </span>

      {/* Current task (compact) */}
      {member.currentTask && (
        <div className="text-[11px] text-[#9ca3af] text-center line-clamp-2 leading-relaxed">
          {member.currentTask}
        </div>
      )}

      {/* Flags */}
      {member.flags.length > 0 && (
        <div className="flex flex-col gap-1 w-full">
          {member.flags.slice(0, 1).map((flag, i) => (
            <div key={i} className="text-[10px] text-red-300/70 text-center truncate">
              {flag}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MartyCard({ marty }: { marty: MartyData }) {
  const isActive = marty.status === 'active'

  return (
    <div className="flex flex-col items-center gap-3 p-5 bg-[#111827] border border-[#1f2937] rounded-xl hover:border-[#06b6d4] transition-all border-dashed">
      {/* Marty avatar */}
      <div className="relative">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl bg-gradient-to-br from-cyan-600 to-blue-800">
          &#x1F916;
        </div>
        <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#111827] ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`} />
      </div>

      {/* Name */}
      <div className="text-center">
        <div className="text-sm font-semibold text-[#06b6d4]">Marty</div>
        <div className="text-[11px] text-[#6b7280]">AI Agent</div>
      </div>

      {/* Status */}
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${isActive ? 'text-emerald-400' : 'text-gray-400'} bg-white/5`}>
        {isActive ? 'Active' : 'Offline'}
      </span>

      {/* Recent activity */}
      {marty.recentActions.length > 0 && (
        <div className="text-[11px] text-[#9ca3af] text-center line-clamp-2 leading-relaxed">
          {marty.recentActions[0].action}
        </div>
      )}

      <div className="text-[10px] text-[#6b7280]">
        Last run: {formatTimeAgo(marty.lastCronRun)}
      </div>
    </div>
  )
}

export function TrypsOfficePanel() {
  const [data, setData] = useState<TrypsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tryps-data')
      if (res.ok) setData(await res.json())
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 120000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading office data...
      </div>
    )
  }

  if (!data?.team) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No team data available.
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-sm font-medium text-foreground uppercase tracking-widest">Virtual Office</h2>
          <p className="text-xs text-muted-foreground mt-1">Who&apos;s working on what right now</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Updated {formatTimeAgo(data.updatedAt)}
          </span>
          <button
            onClick={fetchData}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {data.team.map((member) => (
          <AvatarCard key={member.name} member={member} />
        ))}
        {data.marty && <MartyCard marty={data.marty} />}
      </div>
    </div>
  )
}
