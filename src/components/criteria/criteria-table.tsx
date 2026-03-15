'use client'

import { useState, useCallback } from 'react'
import type { PhaseData, ScopeData, CategoryData, CriterionData, FilterMode } from './types'
import { ASSIGNEE_OPTIONS, QA_STATUS_CONFIG } from './types'
import type { QaStatus } from './types'

interface Props {
  phases: PhaseData[]
  filter: FilterMode
  activeUser: string
  onUpdate: (key: string, update: { assignee?: string; qaStatus?: string; notes?: string }) => void
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

export function CriteriaTable({ phases, filter, activeUser, onUpdate }: Props) {
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
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-white z-10 border-b border-gray-200">
        <tr>
          <th className="text-left px-4 py-2 w-20 text-gray-500 font-medium">Phase</th>
          <th className="text-left px-4 py-2 w-40 text-gray-500 font-medium">Scope</th>
          <th className="text-left px-4 py-2 text-gray-500 font-medium">Success Criteria</th>
          <th className="text-left px-4 py-2 w-28 text-gray-500 font-medium">Assigned</th>
          <th className="text-left px-4 py-2 w-24 text-gray-500 font-medium">QA</th>
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
  return (
    <>
      <tr
        className="bg-gray-50 cursor-pointer hover:bg-gray-100 border-b border-gray-200"
        onClick={onTogglePhase}
      >
        <td className="px-4 py-2 font-semibold text-gray-800" colSpan={3}>
          <span className="mr-2 text-gray-400">{expanded ? '▼' : '▶'}</span>
          {phase.phase.toUpperCase()} — {phase.label.split(' — ')[1] || ''}
          <span className="ml-3 text-xs font-normal text-gray-500">
            {phase.stats.pass}/{phase.stats.total} verified
          </span>
        </td>
        <td className="px-4 py-2" />
        <td className="px-4 py-2">
          <MiniStats stats={phase.stats} />
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
      <tr className="border-b border-gray-100">
        <td className="px-4 py-2" />
        <td className="px-4 py-2 text-gray-700 font-medium">{scope.label}</td>
        <td className="px-4 py-2 text-gray-400 italic" colSpan={3}>
          {scope.criteriaStatus === 'placeholder' ? 'No criteria yet (placeholder)' : 'No spec found'}
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr
        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
        onClick={onToggleScope}
      >
        <td className="px-4 py-2" />
        <td className="px-4 py-2 text-gray-700 font-medium">
          <span className="mr-2 text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
          {scope.label}
        </td>
        <td className="px-4 py-2 text-gray-500 text-xs">
          {scope.stats.pass}/{scope.stats.total} verified
        </td>
        <td className="px-4 py-2" />
        <td className="px-4 py-2">
          <MiniStats stats={scope.stats} />
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
  const catStats = {
    pass: category.criteria.filter(c => c.qaStatus === 'pass').length,
    total: category.criteria.length,
  }

  return (
    <>
      <tr
        className="border-b border-gray-50 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <td className="px-4 py-1.5" />
        <td className="px-4 py-1.5" />
        <td className="px-4 py-1.5 pl-8">
          <span className="mr-2 text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
          <span className="font-medium text-gray-700">{category.name}</span>
          <span className="ml-2 text-xs text-gray-400">{catStats.pass}/{catStats.total}</span>
        </td>
        <td className="px-4 py-1.5" />
        <td className="px-4 py-1.5" />
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
  const canEdit = !!activeUser

  return (
    <tr className="border-b border-gray-50 hover:bg-blue-50/30">
      <td className="px-4 py-1.5" />
      <td className="px-4 py-1.5" />
      <td className="px-4 py-1.5 pl-12">
        <div className="text-gray-800 text-sm">
          {criterion.isNegative && (
            <span className="text-red-500 text-xs font-medium mr-1">NOT:</span>
          )}
          {criterion.text}
        </div>
        {criterion.verifiedBy && (
          <div className="text-xs text-gray-400 mt-0.5">
            Verified by: {criterion.verifiedBy}
          </div>
        )}
      </td>
      <td className="px-4 py-1.5">
        <select
          value={criterion.assignee || ''}
          onChange={e => onUpdate(criterion.key, { assignee: e.target.value || '' })}
          disabled={!canEdit}
          className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white disabled:opacity-50"
        >
          {ASSIGNEE_OPTIONS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-1.5">
        <QaStatusSelect
          value={criterion.qaStatus}
          onChange={(status) => onUpdate(criterion.key, { qaStatus: status })}
          disabled={!canEdit}
        />
      </td>
    </tr>
  )
}

// ── QA Status select ──────────────────────────────────────────────────

function QaStatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: QaStatus
  onChange: (status: QaStatus) => void
  disabled: boolean
}) {
  const config = QA_STATUS_CONFIG[value]

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as QaStatus)}
      disabled={disabled}
      className={`w-full rounded px-1.5 py-0.5 text-xs font-medium border-0 ${config.bg} ${config.text} disabled:opacity-50`}
    >
      {(Object.entries(QA_STATUS_CONFIG) as [QaStatus, typeof config][]).map(([status, cfg]) => (
        <option key={status} value={status}>
          {cfg.icon} {cfg.label}
        </option>
      ))}
    </select>
  )
}

// ── Mini stats indicator ──────────────────────────────────────────────

function MiniStats({ stats }: { stats: { total: number; pass: number; fail: number; blocked: number } }) {
  if (stats.total === 0) return null
  return (
    <div className="flex gap-0.5">
      {stats.pass > 0 && (
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title={`${stats.pass} pass`} />
      )}
      {stats.fail > 0 && (
        <span className="inline-block w-2 h-2 rounded-full bg-red-500" title={`${stats.fail} fail`} />
      )}
      {stats.blocked > 0 && (
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title={`${stats.blocked} blocked`} />
      )}
    </div>
  )
}
