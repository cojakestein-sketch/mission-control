import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getDatabase()
    const body = await request.json()

    const fields: string[] = []
    const values: unknown[] = []

    if (body.parentId !== undefined) { fields.push('parent_id = ?'); values.push(body.parentId) }
    if (body.startDate !== undefined) { fields.push('start_date = ?'); values.push(body.startDate) }
    if (body.endDate !== undefined) { fields.push('end_date = ?'); values.push(body.endDate) }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status) }
    if (body.assigneeId !== undefined) { fields.push('assignee_id = ?'); values.push(body.assigneeId) }
    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
    if (body.color !== undefined) { fields.push('color = ?'); values.push(body.color) }
    if (body.progress !== undefined) { fields.push('progress = ?'); values.push(body.progress) }
    if (body.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(body.sortOrder) }
    if (body.frdContent !== undefined) { fields.push('frd_content = ?'); values.push(body.frdContent) }
    if (body.frdSyncedAt !== undefined) { fields.push('frd_synced_at = ?'); values.push(body.frdSyncedAt) }
    if (body.deepWorkCompleted !== undefined) { fields.push('deep_work_completed = ?'); values.push(body.deepWorkCompleted ? 1 : 0) }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    db.prepare(`UPDATE workstreams SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    return NextResponse.json({ updated: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update workstream', detail: String(err) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getDatabase()
    db.prepare('DELETE FROM workstreams WHERE id = ?').run(id)
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete workstream', detail: String(err) },
      { status: 500 }
    )
  }
}
