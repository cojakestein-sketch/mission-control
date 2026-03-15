import { NextResponse, type NextRequest } from 'next/server'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['untested', 'pass', 'fail', 'blocked'])
const VALID_ASSIGNEES = new Set(['nadeem', 'asif', 'muneeb', 'andreas', 'jake', ''])

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { keys, assignee, qaStatus, updatedBy } = body

    if (!updatedBy) {
      return NextResponse.json({ error: 'updatedBy is required' }, { status: 400 })
    }
    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: 'keys array is required' }, { status: 400 })
    }
    if (keys.length > 200) {
      return NextResponse.json({ error: 'Max 200 keys per batch' }, { status: 400 })
    }
    if (qaStatus && !VALID_STATUSES.has(qaStatus)) {
      return NextResponse.json({ error: `Invalid qaStatus: ${qaStatus}` }, { status: 400 })
    }
    if (assignee !== undefined && !VALID_ASSIGNEES.has(assignee || '')) {
      return NextResponse.json({ error: `Invalid assignee: ${assignee}` }, { status: 400 })
    }

    const db = getDatabase()

    const getCurrent = db.prepare(
      'SELECT criterion_key, assignee, qa_status FROM criteria_overlay WHERE criterion_key = ?'
    )
    const upsert = db.prepare(`
      INSERT INTO criteria_overlay (criterion_key, assignee, qa_status, notes, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(criterion_key) DO UPDATE SET
        assignee = COALESCE(?, assignee),
        qa_status = COALESCE(?, qa_status),
        updated_by = ?,
        updated_at = datetime('now')
    `)
    const logChange = db.prepare(`
      INSERT INTO criteria_changelog (criterion_key, field, old_value, new_value, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `)

    const transaction = db.transaction(() => {
      let updated = 0
      for (const key of keys) {
        const current = getCurrent.get(key) as {
          criterion_key: string
          assignee: string | null
          qa_status: string
        } | undefined

        upsert.run(
          key,
          assignee ?? null,
          qaStatus ?? 'untested',
          null,
          updatedBy,
          assignee !== undefined ? assignee : null,
          qaStatus ?? null,
          updatedBy
        )

        if (assignee !== undefined && assignee !== (current?.assignee ?? null)) {
          logChange.run(key, 'assignee', current?.assignee ?? null, assignee, updatedBy)
        }
        if (qaStatus && qaStatus !== (current?.qa_status ?? 'untested')) {
          logChange.run(key, 'qa_status', current?.qa_status ?? 'untested', qaStatus, updatedBy)
        }
        updated++
      }
      return updated
    })

    const count = transaction()
    return NextResponse.json({ updated: count })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to batch update', detail: String(err) },
      { status: 500 }
    )
  }
}
