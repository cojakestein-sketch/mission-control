export interface CriterionData {
  key: string
  text: string
  hasVerifiedBy: boolean
  verifiedBy: string | null
  isNegative: boolean
  assignee: string | null
  qaStatus: 'untested' | 'pass' | 'fail' | 'blocked'
  notes: string | null
  updatedBy: string | null
  updatedAt: string | null
}

export interface CategoryData {
  name: string
  criteria: CriterionData[]
}

export interface ScopeData {
  scope: string
  label: string
  scopeIndex: number
  criteriaStatus: 'populated' | 'placeholder' | 'missing'
  stats: StatsData
  categories: CategoryData[]
}

export interface PhaseData {
  phase: string
  label: string
  stats: StatsData
  scopes: ScopeData[]
}

export interface StatsData {
  total: number
  pass: number
  fail: number
  blocked: number
  untested: number
}

export interface ChangelogEntry {
  id: number
  criterionKey: string
  field: string
  oldValue: string | null
  newValue: string | null
  changedBy: string
  changedAt: string
}

export type QaStatus = 'untested' | 'pass' | 'fail' | 'blocked'
export type FilterMode = 'all' | 'untested' | 'pass' | 'fail' | 'blocked' | 'mine'
export type Assignee = 'nadeem' | 'asif' | 'muneeb' | 'andreas' | 'jake' | ''

export const ASSIGNEE_OPTIONS: { value: Assignee; label: string }[] = [
  { value: '', label: '—' },
  { value: 'jake', label: 'Jake' },
  { value: 'asif', label: 'Asif' },
  { value: 'nadeem', label: 'Nadeem' },
  { value: 'muneeb', label: 'Muneeb' },
  { value: 'andreas', label: 'Andreas' },
]

export const QA_STATUS_CONFIG: Record<QaStatus, { icon: string; label: string; bg: string; text: string }> = {
  untested: { icon: '○', label: 'Untested', bg: 'bg-gray-100', text: 'text-gray-500' },
  pass: { icon: '✓', label: 'Pass', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  fail: { icon: '✗', label: 'Fail', bg: 'bg-red-100', text: 'text-red-700' },
  blocked: { icon: '■', label: 'Blocked', bg: 'bg-amber-100', text: 'text-amber-700' },
}
