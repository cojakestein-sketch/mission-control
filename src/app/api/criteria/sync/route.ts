import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { config } from '@/lib/config'
import { getDatabase } from '@/lib/db'
import { parseAllSpecs } from '@/lib/spec-parser'

export const dynamic = 'force-dynamic'

interface WorkstreamRow {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
}

const PHASE_PARENTS: Record<string, string> = {
  p1: 'p1-core',
  p2: 'p2-payments',
  p3: 'p3-agents',
  p4: 'p4-brand-gtm',
  p5: 'p5-v2-beta',
}

function slugToLabel(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * POST /api/criteria/sync
 * Reconciles spec files ↔ workstreams table.
 * Creates missing workstreams for new scopes found on disk.
 */
export async function POST() {
  try {
    const db = getDatabase()
    const created: string[] = []
    const warnings: string[] = []

    // Parse all specs from disk
    const scopes = parseAllSpecs(config.specsDir)

    // Load existing workstreams
    const workstreams = db.prepare(
      'SELECT id, name, parent_id, sort_order FROM workstreams WHERE parent_id IS NOT NULL'
    ).all() as WorkstreamRow[]

    const wsIds = new Set(workstreams.map(w => w.id))

    // For each spec scope, check if workstream exists
    for (const scope of scopes) {
      const wsId = `${scope.phase}-${scope.scope}`
      if (wsIds.has(wsId)) continue

      // Missing workstream — create it
      const parentId = PHASE_PARENTS[scope.phase]
      if (!parentId) {
        warnings.push(`Unknown phase ${scope.phase} for scope ${scope.scope}`)
        continue
      }

      // Find max sort_order for this phase to append at end
      const maxSort = workstreams
        .filter(w => w.parent_id === parentId)
        .reduce((max, w) => Math.max(max, w.sort_order), 0)

      const sortOrder = maxSort + 1
      const scopeNum = workstreams.filter(w => w.parent_id === parentId).length + created.filter(c => c.startsWith(scope.phase)).length + 1
      const name = `${scopeNum}. ${slugToLabel(scope.scope)}`

      // Get parent dates for defaults
      const parent = db.prepare('SELECT start_date, end_date FROM workstreams WHERE id = ?').get(parentId) as { start_date: string; end_date: string } | undefined

      db.prepare(`
        INSERT INTO workstreams (id, name, category, start_date, end_date, status, color, sort_order, parent_id, progress)
        VALUES (?, ?, 'scope', ?, ?, 'not_started', '#D9071C', ?, ?, 0)
      `).run(
        wsId,
        name,
        parent?.start_date || '2026-03-15',
        parent?.end_date || '2026-04-02',
        sortOrder,
        parentId
      )

      created.push(`${scope.phase}/${scope.scope} → workstream ${wsId}`)
    }

    // Check for workstreams without spec files
    for (const ws of workstreams) {
      const phase = ws.parent_id?.replace(/-.*$/, '') || ''
      const slug = ws.id.replace(/^p\d+-/, '')
      const specPath = join(config.specsDir, phase, slug, 'spec.md')
      if (!existsSync(specPath)) {
        warnings.push(`Workstream ${ws.id} (${ws.name}) has no spec file at ${phase}/${slug}/spec.md`)
      }
    }

    return NextResponse.json({
      synced: true,
      created,
      warnings,
      totalScopes: scopes.length,
      totalWorkstreams: wsIds.size + created.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Sync failed', detail: String(err) },
      { status: 500 }
    )
  }
}
