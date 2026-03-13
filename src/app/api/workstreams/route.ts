import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface WorkstreamRow {
  id: string
  name: string
  category: string
  parent_id: string | null
  assignee_id: string | null
  start_date: string
  end_date: string
  status: string
  color: string | null
  frd_path: string | null
  frd_content: string | null
  frd_synced_at: string | null
  progress: number
  sort_order: number
  deep_work_completed: number
  created_at: string
  updated_at: string
}

interface TaskRow {
  id: string
  workstream_id: string
  title: string
  status: string
  assignee_id: string | null
  due_date: string | null
  clickup_task_id: string | null
  sort_order: number
}

interface MeetingRow {
  id: string
  workstream_id: string | null
  title: string
  start_time: string
  end_time: string
  attendees: string | null
  meet_link: string | null
  gcal_event_id: string
}

export async function GET() {
  try {
    const db = getDatabase()

    const workstreams = db.prepare(`
      SELECT * FROM workstreams ORDER BY sort_order ASC, start_date ASC
    `).all() as WorkstreamRow[]

    const tasks = db.prepare(`
      SELECT * FROM workstream_tasks ORDER BY sort_order ASC
    `).all() as TaskRow[]

    const meetings = db.prepare(`
      SELECT * FROM workstream_meetings ORDER BY start_time ASC
    `).all() as MeetingRow[]

    // Group tasks and meetings by workstream
    const tasksByWs = new Map<string, TaskRow[]>()
    for (const t of tasks) {
      const arr = tasksByWs.get(t.workstream_id) || []
      arr.push(t)
      tasksByWs.set(t.workstream_id, arr)
    }

    const meetingsByWs = new Map<string, MeetingRow[]>()
    for (const m of meetings) {
      if (m.workstream_id) {
        const arr = meetingsByWs.get(m.workstream_id) || []
        arr.push(m)
        meetingsByWs.set(m.workstream_id, arr)
      }
    }

    const result = workstreams.map(ws => ({
      id: ws.id,
      name: ws.name,
      category: ws.category,
      parentId: ws.parent_id,
      assigneeId: ws.assignee_id,
      startDate: ws.start_date,
      endDate: ws.end_date,
      status: ws.status,
      color: ws.color,
      frdPath: ws.frd_path,
      frdContent: ws.frd_content,
      progress: ws.progress,
      sortOrder: ws.sort_order,
      deepWorkCompleted: ws.deep_work_completed === 1,
      subTasks: (tasksByWs.get(ws.id) || []).map(t => ({
        id: t.id,
        workstreamId: t.workstream_id,
        title: t.title,
        status: t.status,
        assigneeId: t.assignee_id,
        dueDate: t.due_date,
        clickupTaskId: t.clickup_task_id,
        sortOrder: t.sort_order,
      })),
      meetings: (meetingsByWs.get(ws.id) || []).map(m => ({
        id: m.id,
        workstreamId: m.workstream_id,
        title: m.title,
        startTime: m.start_time,
        endTime: m.end_time,
        attendees: m.attendees ? JSON.parse(m.attendees) : [],
        meetLink: m.meet_link,
        gcalEventId: m.gcal_event_id,
      })),
    }))

    return NextResponse.json({ workstreams: result })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch workstreams', detail: String(err) },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const db = getDatabase()
    const body = await request.json()

    const id = body.id || `ws-${Date.now()}`
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO workstreams (id, name, category, assignee_id, start_date, end_date, status, color, frd_path, sort_order, deep_work_completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name,
      body.category || 'scope',
      body.assigneeId || null,
      body.startDate,
      body.endDate,
      body.status || 'not_started',
      body.color || null,
      body.frdPath || null,
      body.sortOrder ?? 0,
      body.deepWorkCompleted ? 1 : 0,
      now,
      now,
    )

    return NextResponse.json({ id, created: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create workstream', detail: String(err) },
      { status: 500 }
    )
  }
}
