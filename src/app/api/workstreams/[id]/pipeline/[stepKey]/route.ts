import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

const VALID_STEP_KEYS = new Set([
  'spec', 'frd', 'design_screens', 'plan', 'work',
  'review', 'compound', 'merge_pr', 'dev_feedback',
  'post_dev_fixes', 'merge_status',  // legacy keys kept for backwards compat
  'merged', 'qa_testing', 'lessons_learned',
])

/**
 * PATCH /api/workstreams/[id]/pipeline/[stepKey]
 * Upsert a pipeline step's content, status, and meta.
 * Body: { status?, content?, meta?, generatedAt? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; stepKey: string }> }
) {
  try {
    const { id, stepKey } = await params
    const db = getDatabase()

    if (!VALID_STEP_KEYS.has(stepKey)) {
      return NextResponse.json(
        { error: `Invalid step key: ${stepKey}` },
        { status: 400 }
      )
    }

    // Verify workstream exists
    const ws = db.prepare('SELECT id FROM workstreams WHERE id = ?').get(id) as { id: string } | undefined
    if (!ws) {
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 })
    }

    const body = await request.json()
    const now = new Date().toISOString()
    const stepId = `sp-${id}-${stepKey}`

    // Check if step exists
    const existing = db.prepare(
      'SELECT id FROM scope_pipeline_steps WHERE workstream_id = ? AND step_key = ?'
    ).get(id, stepKey)

    if (existing) {
      // Update existing step
      const fields: string[] = []
      const values: unknown[] = []

      if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status) }
      if (body.content !== undefined) { fields.push('content = ?'); values.push(body.content) }
      if (body.meta !== undefined) { fields.push('meta = ?'); values.push(JSON.stringify(body.meta)) }
      if (body.generatedAt !== undefined) { fields.push('generated_at = ?'); values.push(body.generatedAt) }

      fields.push('updated_at = ?')
      values.push(now)
      values.push(id)
      values.push(stepKey)

      if (fields.length > 1) {
        db.prepare(
          `UPDATE scope_pipeline_steps SET ${fields.join(', ')} WHERE workstream_id = ? AND step_key = ?`
        ).run(...values)
      }
    } else {
      // Insert new step
      db.prepare(`
        INSERT INTO scope_pipeline_steps (id, workstream_id, step_key, status, content, generated_at, meta, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        stepId,
        id,
        stepKey,
        body.status || 'not_started',
        body.content || null,
        body.generatedAt || null,
        body.meta ? JSON.stringify(body.meta) : null,
        now,
      )
    }

    // Also update legacy workstream columns for spec/frd backward compatibility
    if (stepKey === 'spec' && body.content !== undefined) {
      const specMeta = body.meta || {}
      db.prepare(
        'UPDATE workstreams SET spec_content = ?, spec_path = COALESCE(?, spec_path), updated_at = ? WHERE id = ?'
      ).run(body.content, specMeta.specPath || null, now, id)
    }
    if (stepKey === 'frd' && body.content !== undefined) {
      const frdMeta = body.meta || {}
      db.prepare(
        'UPDATE workstreams SET frd_content = ?, frd_path = COALESCE(?, frd_path), frd_synced_at = ?, updated_at = ? WHERE id = ?'
      ).run(body.content, frdMeta.frdPath || null, now, now, id)
    }

    return NextResponse.json({ updated: true, stepKey, workstreamId: id })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update pipeline step', detail: String(err) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/workstreams/[id]/pipeline/[stepKey]
 * Fetch a single pipeline step.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; stepKey: string }> }
) {
  try {
    const { id, stepKey } = await params
    const db = getDatabase()

    const step = db.prepare(
      'SELECT * FROM scope_pipeline_steps WHERE workstream_id = ? AND step_key = ?'
    ).get(id, stepKey) as {
      id: string
      workstream_id: string
      step_key: string
      status: string
      content: string | null
      generated_at: string | null
      meta: string | null
      updated_at: string
    } | undefined

    if (!step) {
      return NextResponse.json({ error: 'Pipeline step not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: step.id,
      workstreamId: step.workstream_id,
      stepKey: step.step_key,
      status: step.status,
      content: step.content,
      generatedAt: step.generated_at,
      meta: step.meta ? JSON.parse(step.meta) : null,
      updatedAt: step.updated_at,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch pipeline step', detail: String(err) },
      { status: 500 }
    )
  }
}
