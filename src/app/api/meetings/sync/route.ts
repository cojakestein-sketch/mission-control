import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Keyword → workstream_id mapping for GCal event matching
const GCAL_WORKSTREAM_MAP: Record<string, string | null> = {
  'auth': 'auth-system',
  'onboarding': 'auth-system',
  'expense': 'expense-tracking',
  'ledger': 'expense-tracking',
  'invite': 'invite-flow',
  'referral': 'invite-flow',
  'trip detail': 'trip-detail',
  'itinerary': 'trip-detail',
  'notification': 'notifications',
  'push notification': 'notifications',
  'explore': 'explore-globe',
  'globe': 'explore-globe',
  'design': 'design-system',
  'figma': 'design-system',
  'qa': 'qa-testing',
  'testing': 'qa-testing',
  'bug': 'qa-testing',
  'standup': null,
  'sprint': null,
  'retro': null,
  'all hands': null,
  'sync': null,
}

interface GCalEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string; displayName?: string }>
  hangoutLink?: string
  htmlLink?: string
}

function matchWorkstream(title: string): string | null {
  const lower = title.toLowerCase()
  for (const [keyword, wsId] of Object.entries(GCAL_WORKSTREAM_MAP)) {
    if (lower.includes(keyword)) {
      return wsId // null means "general" (unmatched)
    }
  }
  return null // no match = general
}

/**
 * POST /api/meetings/sync
 * Accepts { events: GCalEvent[] } from Marty's gcal-sync cron.
 * Upserts into workstream_meetings with keyword-based workstream matching.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const events: GCalEvent[] = body.events || []

    if (!Array.isArray(events)) {
      return NextResponse.json({ error: 'events must be an array' }, { status: 400 })
    }

    const db = getDatabase()

    const upsert = db.prepare(`
      INSERT INTO workstream_meetings (id, workstream_id, title, start_time, end_time, attendees, meet_link, gcal_event_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(gcal_event_id) DO UPDATE SET
        workstream_id = excluded.workstream_id,
        title = excluded.title,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        attendees = excluded.attendees,
        meet_link = excluded.meet_link
    `)

    let synced = 0
    let matched = 0

    const runSync = db.transaction(() => {
      for (const event of events) {
        const gcalId = event.id
        if (!gcalId) continue

        const title = event.summary || 'Untitled'
        const startTime = event.start?.dateTime || event.start?.date || ''
        const endTime = event.end?.dateTime || event.end?.date || ''
        const attendees = event.attendees
          ? JSON.stringify(event.attendees.map(a => a.displayName || a.email || '').filter(Boolean))
          : null
        const meetLink = event.hangoutLink || null

        const workstreamId = matchWorkstream(title)

        const id = `mtg-${gcalId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}`

        upsert.run(id, workstreamId, title, startTime, endTime, attendees, meetLink, gcalId)
        synced++
        if (workstreamId) matched++
      }
    })

    runSync()

    return NextResponse.json({
      synced,
      matched,
      unmatched: synced - matched,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to sync meetings', detail: String(err) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/meetings/sync
 * Returns sync status and current meeting count.
 */
export async function GET() {
  try {
    const db = getDatabase()
    const total = (db.prepare(`SELECT COUNT(*) as c FROM workstream_meetings`).get() as { c: number }).c
    const matched = (db.prepare(`SELECT COUNT(*) as c FROM workstream_meetings WHERE workstream_id IS NOT NULL`).get() as { c: number }).c
    const unmatched = (db.prepare(`SELECT COUNT(*) as c FROM workstream_meetings WHERE workstream_id IS NULL`).get() as { c: number }).c

    return NextResponse.json({ total, matched, unmatched })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to get meeting stats', detail: String(err) },
      { status: 500 }
    )
  }
}
