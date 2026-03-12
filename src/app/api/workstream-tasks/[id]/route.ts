import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface TaskRow {
  workstream_id: string
}

interface DoneCount {
  total: number
  done: number
}

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

    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status) }
    if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title) }
    if (body.assigneeId !== undefined) { fields.push('assignee_id = ?'); values.push(body.assigneeId) }
    if (body.dueDate !== undefined) { fields.push('due_date = ?'); values.push(body.dueDate) }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    db.prepare(`UPDATE workstream_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    // Recalculate parent workstream progress
    const task = db.prepare('SELECT workstream_id FROM workstream_tasks WHERE id = ?').get(id) as TaskRow | undefined
    if (task) {
      const counts = db.prepare(`
        SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
        FROM workstream_tasks WHERE workstream_id = ?
      `).get(task.workstream_id) as DoneCount

      const progress = counts.total > 0 ? counts.done / counts.total : 0
      db.prepare('UPDATE workstreams SET progress = ?, updated_at = ? WHERE id = ?')
        .run(progress, new Date().toISOString(), task.workstream_id)
    }

    return NextResponse.json({ updated: true, progress: task ? undefined : null })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update task', detail: String(err) },
      { status: 500 }
    )
  }
}
