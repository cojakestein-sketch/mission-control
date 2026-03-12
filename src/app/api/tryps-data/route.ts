import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // In Docker, Marty cron writes to /app/data/data.json (mounted volume)
    // Fallback to public/data.json for dev/seed data
    const paths = [
      join(process.cwd(), 'data', 'data.json'),
      join(process.cwd(), 'public', 'data.json'),
    ]

    for (const filePath of paths) {
      try {
        const raw = await readFile(filePath, 'utf-8')
        const data = JSON.parse(raw)
        return NextResponse.json(data)
      } catch {
        continue
      }
    }

    return NextResponse.json({ error: 'No data file found' }, { status: 404 })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read data', detail: String(err) },
      { status: 500 }
    )
  }
}
