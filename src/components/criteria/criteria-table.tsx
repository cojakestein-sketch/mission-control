'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { PhaseData, ScopeData, CategoryData, CriterionData, FilterMode } from './types'
import { ASSIGNEE_OPTIONS, QA_STATUS_CONFIG } from './types'
import type { QaStatus } from './types'

const QA_STATUSES: QaStatus[] = ['untested', 'pass', 'fail', 'blocked']

interface AddParams {
  type: 'criterion' | 'category' | 'scope'
  phase?: string
  scope?: string
  category?: string
  text?: string
  scopeSlug?: string
  scopeLabel?: string
  categoryName?: string
}

interface Props {
  phases: PhaseData[]
  filter: FilterMode
  search: string
  activeUser: string
  onUpdate: (key: string, update: { assignee?: string; qaStatus?: string; notes?: string }) => void
  onBatchUpdate?: (keys: string[], update: { assignee?: string; qaStatus?: string }) => void
  onAdd?: (params: AddParams) => Promise<void>
}

function matchesFilter(c: CriterionData, filter: FilterMode, activeUser: string): boolean {
  if (filter === 'all') return true
  if (filter === 'mine') return c.assignee === activeUser
  return c.qaStatus === filter
}

function matchesSearch(c: CriterionData, search: string): boolean {
  if (!search) return true
  const q = search.toLowerCase()
  return (
    c.criterionId.toLowerCase().includes(q) ||
    c.text.toLowerCase().includes(q) ||
    (c.assignee || '').toLowerCase().includes(q) ||
    (c.verifiedBy || '').toLowerCase().includes(q)
  )
}

function scopeHasVisible(scope: ScopeData, filter: FilterMode, search: string, activeUser: string): boolean {
  return scope.categories.some(cat =>
    cat.criteria.some(c => matchesFilter(c, filter, activeUser) && matchesSearch(c, search))
  )
}

export function CriteriaTable({ phases, filter, search, activeUser, onUpdate, onAdd }: Props) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(() => new Set(['p1']))
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set())

  // Auto-expand all when searching
  useEffect(() => {
    if (search) {
      setExpandedPhases(new Set(phases.map(p => p.phase)))
      const allScopeKeys = phases.flatMap(p =>
        p.scopes.filter(s => s.criteriaStatus === 'populated').map(s => `${p.phase}/${s.scope}`)
      )
      setExpandedScopes(new Set(allScopeKeys))
    }
  }, [search, phases])

  const togglePhase = useCallback((phase: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }, [])

  const toggleScope = useCallback((key: string) => {
    setExpandedScopes(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <div className="p-4">
      <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: '0 1px' }}>
        <thead className="sticky top-0 z-20">
          <tr className="bg-[#f5f7fa]">
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[88px]">ID</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Criterion</th>
            <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-24">Assigned</th>
            <th className="text-center px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-32">Status</th>
          </tr>
        </thead>
        <tbody>
          {phases.map(phase => (
            <PhaseSection
              key={phase.phase}
              phase={phase}
              filter={filter}
              search={search}
              activeUser={activeUser}
              expanded={expandedPhases.has(phase.phase)}
              expandedScopes={expandedScopes}
              onTogglePhase={() => togglePhase(phase.phase)}
              onToggleScope={toggleScope}
              onUpdate={onUpdate}
              onAdd={onAdd}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Phase header row (full-width, bold, collapsible) ──────────────────

function PhaseSection({
  phase, filter, search, activeUser, expanded, expandedScopes,
  onTogglePhase, onToggleScope, onUpdate, onAdd,
}: {
  phase: PhaseData
  filter: FilterMode
  search: string
  activeUser: string
  expanded: boolean
  expandedScopes: Set<string>
  onTogglePhase: () => void
  onToggleScope: (key: string) => void
  onUpdate: Props['onUpdate']
  onAdd?: Props['onAdd']
}) {
  const pct = phase.stats.total > 0 ? Math.round((phase.stats.pass / phase.stats.total) * 100) : 0
  const [addingScope, setAddingScope] = useState(false)

  return (
    <>
      {/* Phase header */}
      <tr className="cursor-pointer group" onClick={onTogglePhase}>
        <td colSpan={4} className="px-3 py-2.5 bg-gradient-to-r from-red-50 to-white border-l-3 border-red-400">
          <div className="flex items-center gap-2.5">
            <span className="text-red-400 text-[10px] transition-transform duration-150" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            <span className="font-bold text-sm text-red-900">{phase.label}</span>
            <span className="text-[11px] text-red-400 font-medium">{phase.stats.pass}/{phase.stats.total}</span>
            <div className="w-20 h-1.5 bg-red-100 rounded-full overflow-hidden">
              <div className="h-full bg-red-400 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-red-300">{pct}%</span>
            <StatusPills stats={phase.stats} />
          </div>
        </td>
      </tr>

      {expanded && (
        <>
          {phase.scopes
            .filter(scope => filter === 'all' && !search ? true : scopeHasVisible(scope, filter, search, activeUser))
            .map(scope => {
              const scopeKey = `${phase.phase}/${scope.scope}`
              return (
                <ScopeSection
                  key={scopeKey}
                  scope={scope}
                  phase={phase.phase}
                  filter={filter}
                  search={search}
                  activeUser={activeUser}
                  expanded={expandedScopes.has(scopeKey)}
                  onToggle={() => onToggleScope(scopeKey)}
                  onUpdate={onUpdate}
                  onAdd={onAdd}
                />
              )
            })}
          {onAdd && !addingScope && (
            <tr>
              <td colSpan={4} className="pl-8 py-1">
                <button onClick={() => setAddingScope(true)} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                  <span className="w-4 h-4 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-[10px]">+</span>
                  Add scope
                </button>
              </td>
            </tr>
          )}
          {onAdd && addingScope && (
            <InlineAddRow
              placeholder="scope-slug (e.g. push-notifications)"
              colSpan={4}
              onSubmit={(slug) => { onAdd({ type: 'scope', phase: phase.phase, scopeSlug: slug }); setAddingScope(false) }}
              onCancel={() => setAddingScope(false)}
            />
          )}
        </>
      )}
    </>
  )
}

// ── Scope sub-header row ──────────────────────────────────────────────

function ScopeSection({
  scope, phase, filter, search, activeUser, expanded, onToggle, onUpdate, onAdd,
}: {
  scope: ScopeData
  phase: string
  filter: FilterMode
  search: string
  activeUser: string
  expanded: boolean
  onToggle: () => void
  onUpdate: Props['onUpdate']
  onAdd?: Props['onAdd']
}) {
  const [addingCategory, setAddingCategory] = useState(false)

  if (scope.criteriaStatus !== 'populated') {
    return (
      <tr>
        <td colSpan={4} className="pl-8 pr-3 py-2 text-gray-400 italic text-xs">
          <span className="text-gray-500 font-medium not-italic mr-1">{scope.scopeIndex}. {scope.label}</span>
          {scope.criteriaStatus === 'placeholder' ? '— No criteria yet' : '— No spec found'}
        </td>
      </tr>
    )
  }

  const pct = scope.stats.total > 0 ? Math.round((scope.stats.pass / scope.stats.total) * 100) : 0

  return (
    <>
      {/* Scope header */}
      <tr className="cursor-pointer group hover:bg-gray-50/60 transition-colors" onClick={onToggle}>
        <td colSpan={4} className="pl-8 pr-3 py-2 bg-white border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[10px] transition-transform duration-150" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            <span className="font-semibold text-gray-800 text-sm">{scope.scopeIndex}. {scope.label}</span>
            <span className="text-[11px] text-gray-400">{scope.stats.pass}/{scope.stats.total}</span>
            <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <StatusPills stats={scope.stats} />
          </div>
        </td>
      </tr>

      {expanded && (
        <>
          {scope.categories
            .filter(cat => cat.criteria.some(c => matchesFilter(c, filter, activeUser) && matchesSearch(c, search)))
            .map(cat => (
              <CategorySection
                key={`${phase}/${scope.scope}/${cat.name}`}
                category={cat}
                phase={phase}
                scope={scope.scope}
                filter={filter}
                search={search}
                activeUser={activeUser}
                onUpdate={onUpdate}
                onAdd={onAdd}
              />
            ))}
          {onAdd && !addingCategory && (
            <tr>
              <td colSpan={4} className="pl-12 py-1">
                <button onClick={() => setAddingCategory(true)} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
                  <span className="w-4 h-4 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-[10px]">+</span>
                  Add category
                </button>
              </td>
            </tr>
          )}
          {onAdd && addingCategory && (
            <InlineAddRow
              placeholder="Category name (e.g. Error Handling)"
              colSpan={4}
              onSubmit={(name) => { onAdd({ type: 'category', phase, scope: scope.scope, categoryName: name }); setAddingCategory(false) }}
              onCancel={() => setAddingCategory(false)}
            />
          )}
        </>
      )}
    </>
  )
}

// ── Category label row + criterion rows (inline, no extra collapsing) ─

function CategorySection({
  category, phase, scope, filter, search, activeUser, onUpdate, onAdd,
}: {
  category: CategoryData
  phase: string
  scope: string
  filter: FilterMode
  search: string
  activeUser: string
  onUpdate: Props['onUpdate']
  onAdd?: Props['onAdd']
}) {
  const [addingCriterion, setAddingCriterion] = useState(false)
  const visible = category.criteria.filter(c => matchesFilter(c, filter, activeUser) && matchesSearch(c, search))
  if (visible.length === 0 && !addingCriterion) return null

  const passCount = category.criteria.filter(c => c.qaStatus === 'pass').length

  return (
    <>
      {/* Category label — subtle inline divider, not a collapsible section */}
      <tr>
        <td colSpan={4} className="pl-12 pr-3 pt-2 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{category.name}</span>
            <span className="text-[10px] text-gray-300">{passCount}/{category.criteria.length}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
        </td>
      </tr>

      {/* Criterion rows — flat table rows */}
      {visible.map(criterion => (
        <CriterionRow
          key={criterion.key}
          criterion={criterion}
          search={search}
          onUpdate={onUpdate}
        />
      ))}

      {onAdd && !addingCriterion && (
        <tr>
          <td colSpan={4} className="pl-14 py-0.5">
            <button onClick={() => setAddingCriterion(true)} className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-gray-500 transition-colors">
              <span className="text-[9px]">+</span> criterion
            </button>
          </td>
        </tr>
      )}
      {onAdd && addingCriterion && (
        <InlineAddRow
          placeholder="Success criterion text..."
          colSpan={4}
          onSubmit={(text) => { onAdd({ type: 'criterion', phase, scope, category: category.name, text }); setAddingCriterion(false) }}
          onCancel={() => setAddingCriterion(false)}
        />
      )}
    </>
  )
}

// ── Single criterion row — the actual table data ──────────────────────

function CriterionRow({
  criterion,
  search,
  onUpdate,
}: {
  criterion: CriterionData
  search: string
  onUpdate: Props['onUpdate']
}) {
  return (
    <tr className="group hover:bg-blue-50/30 transition-colors duration-75">
      {/* ID column */}
      <td className="pl-14 pr-1 py-1.5 align-top">
        <span className="inline-block font-mono text-[11px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded select-all whitespace-nowrap">
          {criterion.criterionId}
        </span>
      </td>

      {/* Criterion text */}
      <td className="px-3 py-1.5 align-top">
        <div className="text-gray-700 text-[13px] leading-snug">
          {criterion.isNegative && (
            <span className="inline-flex items-center text-red-500 text-[9px] font-bold mr-1 bg-red-50 px-1 py-px rounded uppercase">Not</span>
          )}
          <HighlightedText text={criterion.text} search={search} />
        </div>
        {criterion.verifiedBy && (
          <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">
            <span className="text-emerald-500 mr-0.5">✓</span>
            <HighlightedText text={criterion.verifiedBy} search={search} />
          </div>
        )}
      </td>

      {/* Assignee */}
      <td className="px-3 py-1.5 align-top">
        <select
          value={criterion.assignee || ''}
          onChange={e => onUpdate(criterion.key, { assignee: e.target.value || '' })}
          className="w-full border border-gray-200 rounded px-1.5 py-1 text-[11px] bg-white text-gray-600 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-red-500/20 transition-colors"
        >
          {ASSIGNEE_OPTIONS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </td>

      {/* QA Status */}
      <td className="px-3 py-1.5 align-top text-center">
        <QaStatusChips value={criterion.qaStatus} onChange={(status) => onUpdate(criterion.key, { qaStatus: status })} />
      </td>
    </tr>
  )
}

// ── Highlight matching search text ────────────────────────────────────

function HighlightedText({ text, search }: { text: string; search: string }) {
  if (!search || search.length < 2) return <>{text}</>

  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-yellow-200/70 text-gray-900 rounded-sm px-px">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

// ── QA Status chips ───────────────────────────────────────────────────

function QaStatusChips({ value, onChange }: { value: QaStatus; onChange: (status: QaStatus) => void }) {
  return (
    <div className="inline-flex items-center gap-px bg-gray-100/80 rounded-full p-0.5">
      {QA_STATUSES.map(status => {
        const cfg = QA_STATUS_CONFIG[status]
        const isActive = value === status
        return (
          <button
            key={status}
            onClick={e => { e.stopPropagation(); onChange(status) }}
            title={cfg.label}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-all duration-100 ${
              isActive ? `${cfg.bg} ${cfg.text} shadow-sm` : 'text-gray-300 hover:text-gray-500 hover:bg-white/60'
            }`}
          >
            {cfg.icon}
          </button>
        )
      })}
    </div>
  )
}

// ── Status pills (fail/blocked counts) ────────────────────────────────

function StatusPills({ stats }: { stats: { total: number; pass: number; fail: number; blocked: number } }) {
  if (stats.total === 0) return null
  return (
    <div className="flex gap-1 ml-1">
      {stats.fail > 0 && (
        <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-px rounded-full font-medium">{stats.fail} fail</span>
      )}
      {stats.blocked > 0 && (
        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-px rounded-full font-medium">{stats.blocked} blocked</span>
      )}
    </div>
  )
}

// ── Inline add input ──────────────────────────────────────────────────

function InlineAddRow({
  placeholder, colSpan, onSubmit, onCancel,
}: {
  placeholder: string
  colSpan: number
  onSubmit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = () => {
    if (!text.trim() || saving) return
    setSaving(true)
    onSubmit(text.trim())
  }

  return (
    <tr>
      <td colSpan={colSpan} className="pl-14 pr-3 py-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
            placeholder={placeholder}
            disabled={saving}
            className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300 disabled:opacity-50"
          />
          <button onClick={handleSubmit} disabled={!text.trim() || saving} className="text-xs font-medium text-white bg-gray-900 px-2.5 py-1.5 rounded hover:bg-gray-800 disabled:opacity-40 transition-colors">
            {saving ? '...' : 'Add'}
          </button>
          <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 px-1.5">Cancel</button>
        </div>
      </td>
    </tr>
  )
}
