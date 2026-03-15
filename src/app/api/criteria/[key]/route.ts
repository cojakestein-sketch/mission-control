import { NextResponse, type NextRequest } from 'next/server'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['untested', 'pass', 'fail', 'blocked'])
const VALID_ASSIGNEES = new Set(['nadeem', 'asif', 'muneeb', 'andreas', 'jake', ''])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params
    const criterionKey = decodeURIComponent(key)
    const body = await request.json()
    const { assignee, qaStatus, notes, updatedBy } = body

    if (!updatedBy) {
      return NextResponse.json(
        { error: 'updatedBy is required' },
        { status: 400 }
      )
    }

    if (qaStatus && !VALID_STATUSES.has(qaStatus)) {
      return NextResponse.json(
        { error: `Invalid qaStatus: ${qaStatus}` },
        { status: 400 }
      )
    }

    if (assignee !== undefined && !VALID_ASSIGNEES.has(assignee || '')) {
      return NextResponse.json(
        { error: `Invalid assignee: ${assignee}` },
        { status: 400 }
      )
    }

    const db = getDatabase()

    // Get current values for changelog
    const current = db.prepare(
      'SELECT assignee, qa_status, notes FROM criteria_overlay WHERE criterion_key = ?'
    ).get(criterionKey) as { assignee: string | null; qa_status: string; notes: string | null } | undefined

    // Upsert overlay
    db.prepare(`
      INSERT INTO criteria_overlay (criterion_key, assignee, qa_status, notes, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(criterion_key) DO UPDATE SET
        assignee = COALESCE(?, assignee),
        qa_status = COALESCE(?, qa_status),
        notes = COALESCE(?, notes),
        updated_by = ?,
        updated_at = datetime('now')
    `).run(
      criterionKey,
      assignee ?? null,
      qaStatus ?? 'untested',
      notes ?? null,
      updatedBy,
      assignee !== undefined ? assignee : null,
      qaStatus ?? null,
      notes !== undefined ? notes : null,
      updatedBy
    )

    // Log changes
    const logChange = db.prepare(`
      INSERT INTO criteria_changelog (criterion_key, field, old_value, new_value, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `)

    if (assignee !== undefined && assignee !== (current?.assignee ?? null)) {
      logChange.run(criterionKey, 'assignee', current?.assignee ?? null, assignee, updatedBy)
    }
    if (qaStatus && qaStatus !== (current?.qa_status ?? 'untested')) {
      logChange.run(criterionKey, 'qa_status', current?.qa_status ?? 'untested', qaStatus, updatedBy)
    }
    if (notes !== undefined && notes !== (current?.notes ?? null)) {
      logChange.run(criterionKey, 'notes', current?.notes ?? null, notes, updatedBy)
    }

    return NextResponse.json({ updated: true, key: criterionKey })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update criterion', detail: String(err) },
      { status: 500 }
    )
  }
}
