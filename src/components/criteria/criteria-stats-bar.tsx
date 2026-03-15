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

  return (
    <div className="flex items-center gap-4 text-sm">
      {phases.map(phase => {
        const pct = phase.stats.total > 0
          ? Math.round((phase.stats.pass / phase.stats.total) * 100)
          : 0
        return (
          <div key={phase.phase} className="flex items-center gap-2">
            <span className="font-medium text-gray-700">{phase.phase.toUpperCase()}:</span>
            <span className="text-emerald-600 font-medium">{phase.stats.pass}</span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">{phase.stats.total}</span>
            {phase.stats.fail > 0 && (
              <span className="text-red-500 text-xs">({phase.stats.fail} fail)</span>
            )}
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
      <div className="ml-auto text-gray-500">
        Total: {totalStats.pass}/{totalStats.total} verified
      </div>
    </div>
  )
}
