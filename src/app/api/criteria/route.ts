import { NextResponse } from 'next/server'
import { parseAllSpecs, phaseLabel } from '@/lib/spec-parser'
import { getDatabase } from '@/lib/db'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

interface OverlayRow {
  criterion_key: string
  assignee: string | null
  qa_status: string
  notes: string | null
  updated_by: string | null
  updated_at: string | null
}

interface WorkstreamRow {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
}

export async function GET() {
  try {
    const db = getDatabase()
    const scopes = parseAllSpecs(config.specsDir)

    // Load all overlays
    const overlayRows = db.prepare(
      'SELECT * FROM criteria_overlay'
    ).all() as OverlayRow[]

    const overlayMap = new Map<string, OverlayRow>()
    for (const row of overlayRows) {
      overlayMap.set(row.criterion_key, row)
    }

    // Load workstream sort orders from Gantt DB
    const workstreamRows = db.prepare(
      'SELECT id, name, parent_id, sort_order FROM workstreams WHERE parent_id IS NOT NULL ORDER BY sort_order'
    ).all() as WorkstreamRow[]

    // Build lookup: scope slug → { sortOrder, ganttName }
    // Workstream IDs are like "p1-core-flows", scope slugs are like "core-flows"
    const workstreamMap = new Map<string, { sortOrder: number; ganttName: string }>()
    for (const ws of workstreamRows) {
      // Extract scope slug from workstream ID (remove phase prefix like "p1-")
      const slug = ws.id.replace(/^p\d+-/, '')
      const phase = ws.parent_id?.replace(/-.*$/, '') || ''
      workstreamMap.set(`${phase}/${slug}`, { sortOrder: ws.sort_order, ganttName: ws.name })
    }

    // Group by phase
    const phaseMap = new Map<string, typeof scopes>()
    for (const scope of scopes) {
      const arr = phaseMap.get(scope.phase) || []
      arr.push(scope)
      phaseMap.set(scope.phase, arr)
    }

    const phases = Array.from(phaseMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([phase, phaseScopes]) => {
        // Sort scopes by Gantt sort_order, falling back to alphabetical
        const sortedScopes = [...phaseScopes].sort((a, b) => {
          const aOrder = workstreamMap.get(`${phase}/${a.scope}`)?.sortOrder ?? 999
          const bOrder = workstreamMap.get(`${phase}/${b.scope}`)?.sortOrder ?? 999
          if (aOrder !== bOrder) return aOrder - bOrder
          return a.scope.localeCompare(b.scope)
        })

        const scopeResults = sortedScopes.map((scope, idx) => {
          // Group criteria by category
          const categoryMap = new Map<string, typeof scope.criteria>()
          for (const c of scope.criteria) {
            const arr = categoryMap.get(c.category) || []
            arr.push(c)
            categoryMap.set(c.category, arr)
          }

          // Generate sequential criterion IDs across all categories in this scope
          const phaseNum = phase.replace('p', '')
          const scopeNum = idx + 1
          let criterionSeq = 0

          const categories = Array.from(categoryMap.entries()).map(
            ([name, criteria]) => ({
              name,
              criteria: criteria.map(c => {
                criterionSeq++
                const overlay = overlayMap.get(c.key)
                return {
                  key: c.key,
                  criterionId: `P${phaseNum}.S${scopeNum}.C${String(criterionSeq).padStart(2, '0')}`,
                  text: c.text,
                  hasVerifiedBy: c.hasVerifiedBy,
                  verifiedBy: c.verifiedBy || null,
                  isNegative: c.isNegative,
                  assignee: overlay?.assignee || null,
                  qaStatus: overlay?.qa_status || 'untested',
                  notes: overlay?.notes || null,
                  updatedBy: overlay?.updated_by || null,
                  updatedAt: overlay?.updated_at || null,
                }
              }),
            })
          )

          const allCriteria = categories.flatMap(c => c.criteria)
          const stats = {
            total: allCriteria.length,
            pass: allCriteria.filter(c => c.qaStatus === 'pass').length,
            fail: allCriteria.filter(c => c.qaStatus === 'fail').length,
            blocked: allCriteria.filter(c => c.qaStatus === 'blocked').length,
            untested: allCriteria.filter(c => c.qaStatus === 'untested').length,
          }

          // Use Gantt label if available, otherwise parsed label
          const wsInfo = workstreamMap.get(`${phase}/${scope.scope}`)
          const label = wsInfo
            ? wsInfo.ganttName.replace(/^\d+\.\s*/, '')
            : scope.scopeLabel

          return {
            scope: scope.scope,
            label,
            scopeIndex: idx + 1,
            criteriaStatus: scope.criteriaStatus,
            stats,
            categories,
          }
        })

        // Phase-level stats
        const phaseStats = scopeResults.reduce(
          (acc, s) => ({
            total: acc.total + s.stats.total,
            pass: acc.pass + s.stats.pass,
            fail: acc.fail + s.stats.fail,
            blocked: acc.blocked + s.stats.blocked,
            untested: acc.untested + s.stats.untested,
          }),
          { total: 0, pass: 0, fail: 0, blocked: 0, untested: 0 }
        )

        return {
          phase,
          label: phaseLabel(phase),
          stats: phaseStats,
          scopes: scopeResults,
        }
      })

    return NextResponse.json({ phases })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch criteria', detail: String(err) },
      { status: 500 }
    )
  }
}
