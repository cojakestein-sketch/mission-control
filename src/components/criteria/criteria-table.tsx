'use client'

import { useState, useCallback } from 'react'
import type { PhaseData, ScopeData, CategoryData, CriterionData, FilterMode } from './types'
import { ASSIGNEE_OPTIONS, QA_STATUS_CONFIG } from './types'
import type { QaStatus } from './types'

const QA_STATUSES: QaStatus[] = ['untested', 'pass', 'fail', 'blocked']

interface Props {
  phases: PhaseData[]
  filter: FilterMode
  activeUser: string
  onUpdate: (key: string, update: { assignee?: string; qaStatus?: string; notes?: string }) => void
  onBatchUpdate?: (keys: string[], update: { assignee?: string; qaStatus?: string }) => void
}

function matchesFilter(c: CriterionData, filter: FilterMode, activeUser: string): boolean {
  if (filter === 'all') return true
  if (filter === 'mine') return c.assignee === activeUser
  return c.qaStatus === filter
}

function categoryHasVisibleCriteria(cat: CategoryData, filter: FilterMode, activeUser: string): boolean {
  return cat.criteria.some(c => matchesFilter(c, filter, activeUser))
}

function scopeHasVisibleCriteria(scope: ScopeData, filter: FilterMode, activeUser: string): boolean {
  return scope.categories.some(cat => categoryHasVisibleCriteria(cat, filter, activeUser))
}

export function CriteriaTable({ phases, filter, activeUser, onUpdate, onBatchUpdate }: Props) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(() => new Set(['p1']))
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const toggleSet = useCallback((setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <div className="p-4">
      <table className="w-full text-sm border-separate" style={{ borderSpacing: '0 2px' }}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-[#f5f7fa]">
              Scope / Criteria
            </th>
            <th className="text-left px-4 py-2.5 w-32 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-[#f5f7fa]">
              Assigned
            </th>
            <th className="text-left px-4 py-2.5 w-36 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-[#f5f7fa]">
              QA Status
            </th>
          </tr>
        </thead>
        <tbody>
          {phases.map(phase => (
            <PhaseRows
              key={phase.phase}
              phase={phase}
              filter={filter}
              activeUser={activeUser}
              expanded={expandedPhases.has(phase.phase)}
              expandedScopes={expandedScopes}
              expandedCategories={expandedCategories}
              onTogglePhase={() => toggleSet(setExpandedPhases, phase.phase)}
              onToggleScope={(key: string) => toggleSet(setExpandedScopes, key)}
              onToggleCategory={(key: string) => toggleSet(setExpandedCategories, key)}
              onUpdate={onUpdate}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Phase rows ────────────────────────────────────────────────────────

interface PhaseRowsProps {
  phase: PhaseData
  filter: FilterMode
  activeUser: string
  expanded: boolean
  expandedScopes: Set<string>
  expandedCategories: Set<string>
  onTogglePhase: () => void
  onToggleScope: (key: string) => void
  onToggleCategory: (key: string) => void
  onUpdate: Props['onUpdate']
}

function PhaseRows({
  phase, filter, activeUser, expanded,
  expandedScopes, expandedCategories,
  onTogglePhase, onToggleScope, onToggleCategory, onUpdate,
}: PhaseRowsProps) {
  const pct = phase.stats.total > 0
    ? Math.round((phase.stats.pass / phase.stats.total) * 100)
    : 0

  return (
    <>
      <tr
        className="cursor-pointer group"
        onClick={onTogglePhase}
      >
        <td
          className="px-4 py-3 font-bold text-red-900 bg-red-50 rounded-l-lg border-l-4 border-red-400"
          colSpan={2}
        >
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-xs transition-transform duration-150" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              ▶
            </span>
            <span className="text-sm">{phase.label}</span>
            <span className="text-xs font-normal text-red-400 ml-2">
              {phase.stats.pass}/{phase.stats.total} verified
            </span>
          </div>
        </td>
        <td className="px-4 py-3 bg-red-50 rounded-r-lg">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-red-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-400 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-red-400 w-8 text-right">{pct}%</span>
          </div>
        </td>
      </tr>
      {expanded &&
        phase.scopes
          .filter(scope => filter === 'all' || scopeHasVisibleCriteria(scope, filter, activeUser))
          .map(scope => {
            const scopeKey = `${phase.phase}/${scope.scope}`
            return (
              <ScopeRows
                key={scopeKey}
                scope={scope}
                phase={phase.phase}
                filter={filter}
                activeUser={activeUser}
                expanded={expandedScopes.has(scopeKey)}
                expandedCategories={expandedCategories}
                onToggleScope={() => onToggleScope(scopeKey)}
                onToggleCategory={onToggleCategory}
                onUpdate={onUpdate}
              />
            )
          })}
    </>
  )
}

// ── Scope rows ────────────────────────────────────────────────────────

interface ScopeRowsProps {
  scope: ScopeData
  phase: string
  filter: FilterMode
  activeUser: string
  expanded: boolean
  expandedCategories: Set<string>
  onToggleScope: () => void
  onToggleCategory: (key: string) => void
  onUpdate: Props['onUpdate']
}

function ScopeRows({
  scope, phase, filter, activeUser, expanded,
  expandedCategories, onToggleScope, onToggleCategory, onUpdate,
}: ScopeRowsProps) {
  if (scope.criteriaStatus !== 'populated') {
    return (
      <tr>
        <td className="pl-10 pr-4 py-2.5 text-gray-400 italic bg-white rounded-lg" colSpan={3}>
          <span className="text-gray-600 font-medium mr-2">{scope.scopeIndex}. {scope.label}</span>
          <span className="text-xs">
            {scope.criteriaStatus === 'placeholder' ? '— No criteria yet' : '— No spec found'}
          </span>
        </td>
      </tr>
    )
  }

  const pct = scope.stats.total > 0
    ? Math.round((scope.stats.pass / scope.stats.total) * 100)
    : 0

  return (
    <>
      <tr
        className="cursor-pointer group"
        onClick={onToggleScope}
      >
        <td className="pl-10 pr-4 py-2.5 bg-white rounded-l-lg shadow-sm" colSpan={2}>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs transition-transform duration-150" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              ▶
            </span>
            <span className="font-semibold text-gray-800">{scope.scopeIndex}. {scope.label}</span>
            <span className="text-xs text-gray-400 ml-1">
              {scope.stats.pass}/{scope.stats.total}
            </span>
            <StatusDots stats={scope.stats} />
          </div>
        </td>
        <td className="px-4 py-2.5 bg-white rounded-r-lg shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
          </div>
        </td>
      </tr>
      {expanded &&
        scope.categories
          .filter(cat => filter === 'all' || categoryHasVisibleCriteria(cat, filter, activeUser))
          .map(cat => {
            const catKey = `${phase}/${scope.scope}/${cat.name}`
            return (
              <CategoryRows
                key={catKey}
                category={cat}
                filter={filter}
                activeUser={activeUser}
                expanded={expandedCategories.has(catKey)}
                onToggle={() => onToggleCategory(catKey)}
                onUpdate={onUpdate}
              />
            )
          })}
    </>
  )
}

// ── Category rows ─────────────────────────────────────────────────────

interface CategoryRowsProps {
  category: CategoryData
  filter: FilterMode
  activeUser: string
  expanded: boolean
  onToggle: () => void
  onUpdate: Props['onUpdate']
}

function CategoryRows({ category, filter, activeUser, expanded, onToggle, onUpdate }: CategoryRowsProps) {
  const visibleCriteria = category.criteria.filter(c => matchesFilter(c, filter, activeUser))
  const passCount = category.criteria.filter(c => c.qaStatus === 'pass').length
  const totalCount = category.criteria.length

  return (
    <>
      <tr
        className="cursor-pointer group"
        onClick={onToggle}
      >
        <td className="pl-16 pr-4 py-2 bg-gray-50/80 rounded-l-lg border-l-2 border-gray-200" colSpan={3}>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[10px] transition-transform duration-150" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              ▶
            </span>
            <span className="font-medium text-gray-700 text-sm">{category.name}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {passCount}/{totalCount}
            </span>
          </div>
        </td>
      </tr>
      {expanded &&
        visibleCriteria.map(criterion => (
          <CriterionRow
            key={criterion.key}
            criterion={criterion}
            activeUser={activeUser}
            onUpdate={onUpdate}
          />
        ))}
    </>
  )
}

// ── Single criterion row ──────────────────────────────────────────────

interface CriterionRowProps {
  criterion: CriterionData
  activeUser: string
  onUpdate: Props['onUpdate']
}

function CriterionRow({ criterion, activeUser, onUpdate }: CriterionRowProps) {
  return (
    <tr className="group hover:bg-blue-50/40 transition-colors duration-100">
      <td className="pl-20 pr-4 py-2.5 bg-white rounded-l-lg">
        <div className="text-gray-700 text-sm leading-relaxed">
          {criterion.isNegative && (
            <span className="inline-flex items-center text-red-500 text-[10px] font-bold mr-1.5 bg-red-50 px-1.5 py-0.5 rounded uppercase">
              Not
            </span>
          )}
          {criterion.text}
        </div>
        {criterion.verifiedBy && (
          <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
            <span className="text-emerald-500">✓</span> Verified by: {criterion.verifiedBy}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 bg-white">
        <select
          value={criterion.assignee || ''}
          onChange={e => onUpdate(criterion.key, { assignee: e.target.value || '' })}
          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-colors"
        >
          {ASSIGNEE_OPTIONS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5 bg-white rounded-r-lg">
        <QaStatusChips
          value={criterion.qaStatus}
          onChange={(status) => onUpdate(criterion.key, { qaStatus: status })}
        />
      </td>
    </tr>
  )
}

// ── QA Status chips ──────────────────────────────────────────────────

function QaStatusChips({
  value,
  onChange,
}: {
  value: QaStatus
  onChange: (status: QaStatus) => void
}) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-gray-100/80 rounded-full p-0.5">
      {QA_STATUSES.map(status => {
        const cfg = QA_STATUS_CONFIG[status]
        const isActive = value === status
        return (
          <button
            key={status}
            onClick={(e) => { e.stopPropagation(); onChange(status) }}
            title={cfg.label}
            className={`
              w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
              transition-all duration-150
              ${isActive
                ? `${cfg.bg} ${cfg.text} shadow-sm`
                : 'text-gray-300 hover:text-gray-500 hover:bg-white/60'
              }
            `}
          >
            {cfg.icon}
          </button>
        )
      })}
    </div>
  )
}

// ── Status dots ──────────────────────────────────────────────────────

function StatusDots({ stats }: { stats: { total: number; pass: number; fail: number; blocked: number } }) {
  if (stats.total === 0) return null
  return (
    <div className="flex gap-1 ml-1">
      {stats.fail > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">
          {stats.fail} fail
        </span>
      )}
      {stats.blocked > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
          {stats.blocked} blocked
        </span>
      )}
    </div>
  )
}
