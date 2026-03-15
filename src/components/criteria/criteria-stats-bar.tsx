'use client'

import type { PhaseData } from './types'

interface Props {
  phases: PhaseData[]
}

export function CriteriaStatsBar({ phases }: Props) {
  const totalStats = phases.reduce(
    (acc, p) => ({
      total: acc.total + p.stats.total,
      pass: acc.pass + p.stats.pass,
      fail: acc.fail + p.stats.fail,
      blocked: acc.blocked + p.stats.blocked,
      untested: acc.untested + p.stats.untested,
    }),
    { total: 0, pass: 0, fail: 0, blocked: 0, untested: 0 }
  )

  const overallPct = totalStats.total > 0
    ? Math.round((totalStats.pass / totalStats.total) * 100)
    : 0

  return (
    <div className="flex items-stretch gap-3 overflow-x-auto">
      {/* Overall progress */}
      <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5 min-w-fit">
        <div className="relative w-10 h-10">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeDasharray={`${overallPct}, 100`}
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
            {overallPct}%
          </span>
        </div>
        <div>
          <div className="text-sm font-bold text-gray-900">{totalStats.pass}/{totalStats.total}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Verified</div>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-2.5 min-w-fit">
        <StatusPill count={totalStats.pass} label="Pass" color="emerald" />
        <StatusPill count={totalStats.fail} label="Fail" color="red" />
        <StatusPill count={totalStats.blocked} label="Blocked" color="amber" />
        <StatusPill count={totalStats.untested} label="Untested" color="gray" />
      </div>

      {/* Per-phase progress */}
      {phases.map(phase => {
        const pct = phase.stats.total > 0
          ? Math.round((phase.stats.pass / phase.stats.total) * 100)
          : 0
        return (
          <div key={phase.phase} className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-4 py-2.5 min-w-fit">
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {phase.phase.toUpperCase()}
              </div>
              <div className="text-sm font-bold text-gray-800">
                {phase.stats.pass}<span className="text-gray-400 font-normal">/{phase.stats.total}</span>
              </div>
            </div>
            <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatusPill({ count, label, color }: { count: number; label: string; color: string }) {
  const colorMap: Record<string, { dot: string; text: string }> = {
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
    red: { dot: 'bg-red-500', text: 'text-red-700' },
    amber: { dot: 'bg-amber-500', text: 'text-amber-700' },
    gray: { dot: 'bg-gray-400', text: 'text-gray-600' },
  }
  const c = colorMap[color] || colorMap.gray

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      <span className={`text-xs font-semibold ${c.text}`}>{count}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  )
}
