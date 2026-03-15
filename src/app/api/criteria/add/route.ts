import { NextResponse, type NextRequest } from 'next/server'
import { config } from '@/lib/config'
import { addCriterionToSpec, addCategoryToSpec, addScopeSpec } from '@/lib/spec-writer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type } = body

    if (type === 'criterion') {
      const { phase, scope, category, text } = body
      if (!phase || !scope || !category || !text) {
        return NextResponse.json(
          { error: 'phase, scope, category, and text are required' },
          { status: 400 }
        )
      }
      addCriterionToSpec(config.specsDir, phase, scope, category, text)
      return NextResponse.json({ added: 'criterion', phase, scope, category, text })
    }

    if (type === 'category') {
      const { phase, scope, categoryName } = body
      if (!phase || !scope || !categoryName) {
        return NextResponse.json(
          { error: 'phase, scope, and categoryName are required' },
          { status: 400 }
        )
      }
      addCategoryToSpec(config.specsDir, phase, scope, categoryName)
      return NextResponse.json({ added: 'category', phase, scope, categoryName })
    }

    if (type === 'scope') {
      const { phase, scopeSlug, scopeLabel } = body
      if (!phase || !scopeSlug) {
        return NextResponse.json(
          { error: 'phase and scopeSlug are required' },
          { status: 400 }
        )
      }
      const label = scopeLabel || scopeSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      addScopeSpec(config.specsDir, phase, scopeSlug, label)
      return NextResponse.json({ added: 'scope', phase, scopeSlug, label })
    }

    return NextResponse.json(
      { error: `Unknown type: ${type}. Use criterion, category, or scope.` },
      { status: 400 }
    )
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to add', detail: String(err) },
      { status: 500 }
    )
  }
}
