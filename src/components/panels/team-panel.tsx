'use client'

import { useEffect, useState, useCallback } from 'react'

interface TeamMember {
  name: string
  role: string
  github: string | null
  status: 'green' | 'yellow' | 'red'
  commits24h: number | null
  openPRs: number | null
  merged7d: number | null
  prCycleHours: number | null
  currentTask: string | null
  currentTaskStatus: string | null
  daysInStatus: number
  flags: string[]
}

interface TrypsData {
  updatedAt: string
  team: TeamMember[]
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

const STATUS_CONFIG = {
  green: { label: 'Shipping', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-l-emerald-500', dot: 'bg-emerald-500' },
  yellow: { label: 'Check In', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-l-amber-500', dot: 'bg-amber-500' },
  red: { label: 'Stuck', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-l-red-500', dot: 'bg-red-500' },
} as const

function TeamCard({ member }: { member: TeamMember }) {
  const status = STATUS_CONFIG[member.status]
  const isDev = member.github !== null
  const isDesigner = !isDev && member.role?.toLowerCase().includes('designer')
  const isQA = member.role?.toLowerCase().includes('qa')

  return (
    <div className={`bg-[#111827] border border-[#1f2937] ${status.border} border-l-[3px] rounded-xl p-4 flex flex-col gap-3 hover:border-[#06b6d4] transition-colors`}>
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="text-[15px] font-bold text-[#f9fafb]">{member.name}</div>
          <div className="text-[11px] text-[#6b7280]">{member.role}</div>
        </div>
        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${status.bg} ${status.text}`}>
          {status.label}
        </span>
      </div>

      {/* Metrics */}
      {isDev && (
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="Commits (24h)" value={member.commits24h ?? '--'} />
          <Metric label="Open PRs" value={member.openPRs ?? '--'} />
          <Metric label="Merged (7d)" value={member.merged7d ?? '--'} />
          <Metric label="PR Cycle" value={member.prCycleHours ? `${member.prCycleHours}h` : '--'} />
        </div>
      )}

      {isQA && (
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="Commits (24h)" value={member.commits24h ?? '--'} />
          <Metric label="Open PRs" value={member.openPRs ?? '--'} />
        </div>
      )}

      {isDesigner && (
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="Tasks Active" value={member.daysInStatus > 0 ? 1 : 0} />
          <Metric label="Status Days" value={member.daysInStatus} />
        </div>
      )}

      {/* Current task */}
      {member.currentTask && (
        <div className="bg-white/[0.03] rounded-lg p-2.5">
          <div className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1">Current Task</div>
          <div className="text-[13px] text-[#e5e7eb]">{member.currentTask}</div>
          {member.currentTaskStatus && (
            <div className="text-[11px] text-[#6b7280] mt-1">
              {member.currentTaskStatus}{member.daysInStatus > 0 ? ` · Day ${member.daysInStatus}` : ''}
            </div>
          )}
        </div>
      )}

      {/* Flags */}
      {member.flags.length > 0 && (
        <div className="flex flex-col gap-1 mt-auto">
          {member.flags.map((flag, i) => {
            const isRed = /no commits|stuck|blocked|5\+?\s*days|no github|no clickup/i.test(flag)
            return (
              <div
                key={i}
                className={`text-xs px-2 py-1 rounded-md ${
                  isRed ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-200'
                }`}
              >
                {flag}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">{label}</span>
      <span className="text-lg font-bold text-[#f9fafb]">{value}</span>
    </div>
  )
}

export function TeamPanel() {
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
        Loading team data...
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

  const greenCount = data.team.filter(t => t.status === 'green').length
  const yellowCount = data.team.filter(t => t.status === 'yellow').length
  const redCount = data.team.filter(t => t.status === 'red').length

  return (
    <div className="p-4">
      {/* Summary */}
      <div className="flex items-center gap-4 mb-4 px-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">Team Health:</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-emerald-400">{greenCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-amber-400">{yellowCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-red-400">{redCount}</span>
          </span>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          Updated {formatTimeAgo(data.updatedAt)}
        </span>
        <button
          onClick={fetchData}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.team.map((member) => (
          <TeamCard key={member.name} member={member} />
        ))}
      </div>
    </div>
  )
}
