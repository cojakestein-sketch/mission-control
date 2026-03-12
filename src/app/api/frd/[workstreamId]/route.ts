import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { githubFetch, getGitHubToken } from '@/lib/github'

export const dynamic = 'force-dynamic'

const FRD_STALE_MS = 60 * 60 * 1000 // 1 hour

// Default repo for FRD files
const FRD_REPO = 'cojakestein-sketch/tryps-docs'

/**
 * GET /api/frd/[workstreamId]
 * Fetches FRD markdown from GitHub if stale (>1 hour), caches in SQLite.
 * Returns cached content immediately if fresh.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workstreamId: string }> }
) {
  try {
    const { workstreamId } = await params
    const db = getDatabase()

    // Get workstream with current FRD state
    const ws = db.prepare(`
      SELECT id, frd_path, frd_content, frd_synced_at FROM workstreams WHERE id = ?
    `).get(workstreamId) as {
      id: string
      frd_path: string | null
      frd_content: string | null
      frd_synced_at: string | null
    } | undefined

    if (!ws) {
      return NextResponse.json({ error: 'Workstream not found' }, { status: 404 })
    }

    // If no frd_path configured, return empty
    if (!ws.frd_path) {
      return NextResponse.json({
        workstreamId,
        frdContent: null,
        frdPath: null,
        cached: false,
        message: 'No FRD path configured',
      })
    }

    // Check if cache is fresh
    const now = Date.now()
    const syncedAt = ws.frd_synced_at ? new Date(ws.frd_synced_at).getTime() : 0
    const isFresh = (now - syncedAt) < FRD_STALE_MS

    if (isFresh && ws.frd_content) {
      return NextResponse.json({
        workstreamId,
        frdContent: ws.frd_content,
        frdPath: ws.frd_path,
        cached: true,
        syncedAt: ws.frd_synced_at,
      })
    }

    // Check if GitHub token is available
    if (!getGitHubToken()) {
      // Return cached content if available, even if stale
      return NextResponse.json({
        workstreamId,
        frdContent: ws.frd_content,
        frdPath: ws.frd_path,
        cached: true,
        stale: true,
        message: 'GITHUB_TOKEN not configured — returning cached content',
      })
    }

    // Fetch from GitHub
    const frdPath = ws.frd_path
    // frd_path format: "repo:path" or just "path" (uses default repo)
    let repo = FRD_REPO
    let filePath = frdPath
    if (frdPath.includes(':')) {
      const parts = frdPath.split(':')
      repo = parts[0]
      filePath = parts.slice(1).join(':')
    }

    try {
      const res = await githubFetch(`/repos/${repo}/contents/${filePath}`)

      if (!res.ok) {
        if (res.status === 404) {
          // File doesn't exist yet — cache null content
          db.prepare(`
            UPDATE workstreams SET frd_content = NULL, frd_synced_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
          `).run(workstreamId)

          return NextResponse.json({
            workstreamId,
            frdContent: null,
            frdPath: ws.frd_path,
            cached: false,
            message: 'FRD file not found on GitHub',
          })
        }
        throw new Error(`GitHub API error: ${res.status}`)
      }

      const data = await res.json() as { content: string; encoding: string }

      // Decode base64 content
      let content = ''
      if (data.encoding === 'base64') {
        content = Buffer.from(data.content, 'base64').toString('utf-8')
      } else {
        content = data.content
      }

      // Cache in SQLite
      db.prepare(`
        UPDATE workstreams SET frd_content = ?, frd_synced_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(content, workstreamId)

      return NextResponse.json({
        workstreamId,
        frdContent: content,
        frdPath: ws.frd_path,
        cached: false,
        syncedAt: new Date().toISOString(),
      })
    } catch (fetchErr) {
      // On fetch error, return stale cached content if available
      if (ws.frd_content) {
        return NextResponse.json({
          workstreamId,
          frdContent: ws.frd_content,
          frdPath: ws.frd_path,
          cached: true,
          stale: true,
          error: String(fetchErr),
        })
      }

      return NextResponse.json(
        { error: 'Failed to fetch FRD', detail: String(fetchErr) },
        { status: 502 }
      )
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to get FRD', detail: String(err) },
      { status: 500 }
    )
  }
}
