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
        const scopeResults = phaseScopes.map((scope, idx) => {
          // Group criteria by category
          const categoryMap = new Map<string, typeof scope.criteria>()
          for (const c of scope.criteria) {
            const arr = categoryMap.get(c.category) || []
            arr.push(c)
            categoryMap.set(c.category, arr)
          }

          const categories = Array.from(categoryMap.entries()).map(
            ([name, criteria]) => ({
              name,
              criteria: criteria.map(c => {
                const overlay = overlayMap.get(c.key)
                return {
                  key: c.key,
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

          return {
            scope: scope.scope,
            label: scope.scopeLabel,
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
