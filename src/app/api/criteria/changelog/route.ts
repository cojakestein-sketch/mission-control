import { NextResponse, type NextRequest } from 'next/server'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface ChangelogRow {
  id: number
  criterion_key: string
  field: string
  old_value: string | null
  new_value: string | null
  changed_by: string
  changed_at: string
}

export async function GET(request: NextRequest) {
  try {
    const db = getDatabase()
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 200)
    const criterionKey = searchParams.get('key')

    let rows: ChangelogRow[]
    if (criterionKey) {
      rows = db.prepare(
        'SELECT * FROM criteria_changelog WHERE criterion_key = ? ORDER BY changed_at DESC LIMIT ?'
      ).all(criterionKey, limit) as ChangelogRow[]
    } else {
      rows = db.prepare(
        'SELECT * FROM criteria_changelog ORDER BY changed_at DESC LIMIT ?'
      ).all(limit) as ChangelogRow[]
    }

    return NextResponse.json({
      changes: rows.map(r => ({
        id: r.id,
        criterionKey: r.criterion_key,
        field: r.field,
        oldValue: r.old_value,
        newValue: r.new_value,
        changedBy: r.changed_by,
        changedAt: r.changed_at,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch changelog', detail: String(err) },
      { status: 500 }
    )
  }
}
