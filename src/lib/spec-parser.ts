import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
import { createHash } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────
export interface ParsedCriterion {
  key: string
  phase: string
  scope: string
  category: string
  text: string
  hasVerifiedBy: boolean
  verifiedBy?: string
  isNegative: boolean
  sortOrder: number
}

export interface ParsedScope {
  phase: string
  scope: string
  scopeLabel: string
  specPath: string
  criteriaStatus: 'populated' | 'placeholder' | 'missing'
  criteria: ParsedCriterion[]
}

// ── Helpers ───────────────────────────────────────────────────────────

function slugToLabel(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    p1: 'Phase 1 — Core App',
    p2: 'Phase 2 — Payments & Integrations',
    p3: 'Phase 3 — Agent Layer',
    p4: 'Phase 4 — Brand & GTM',
    p5: 'Phase 5 — V2 Beta',
    reports: 'Daily Reports — Jake',
  }
  return labels[phase] || phase.toUpperCase()
}

export function generateCriterionKey(
  phase: string,
  scope: string,
  category: string,
  text: string
): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ')
  const hash = createHash('sha256')
    .update(`${phase}/${scope}/${category}/${normalized}`)
    .digest('hex')
    .slice(0, 8)
  const categorySlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${phase}/${scope}/${categorySlug}/${hash}`
}

// ── Parser ────────────────────────────────────────────────────────────

function extractCriteriaText(bullet: string): { text: string; verifiedBy?: string } {
  // Strip leading `- [ ] `, `- [x] `, `- ` patterns
  let cleaned = bullet.replace(/^-\s*\[[ x]\]\s*/, '').replace(/^-\s*/, '').trim()

  // Extract "Verified by:" portion
  const vbMatch = cleaned.match(/\.\s*Verified by:\s*(.+)$/i)
  if (vbMatch) {
    const text = cleaned.slice(0, vbMatch.index!).trim()
    return { text, verifiedBy: vbMatch[1].trim() }
  }

  return { text: cleaned }
}

export function parseSpecFile(filePath: string, phase: string, scope: string): ParsedScope {
  const result: ParsedScope = {
    phase,
    scope,
    scopeLabel: slugToLabel(scope),
    specPath: filePath,
    criteriaStatus: 'missing',
    criteria: [],
  }

  if (!existsSync(filePath)) return result

  const content = readFileSync(filePath, 'utf8')

  // Find the criteria section
  const criteriaMatch = content.match(/^##\s+(Acceptance Criteria|Success Criteria)\s*$/im)
  if (!criteriaMatch) {
    result.criteriaStatus = 'missing'
    return result
  }

  // Get everything after the criteria header until the next H2 or end of file
  const startIdx = criteriaMatch.index! + criteriaMatch[0].length
  const restContent = content.slice(startIdx)
  const nextH2Match = restContent.match(/^##\s+[^#]/m)
  const sectionContent = nextH2Match
    ? restContent.slice(0, nextH2Match.index)
    : restContent

  // Check for placeholder
  if (sectionContent.match(/_To be generated/i) || sectionContent.trim().length < 10) {
    result.criteriaStatus = 'placeholder'
    return result
  }

  result.criteriaStatus = 'populated'

  // Parse line by line
  const lines = sectionContent.split('\n')
  let currentCategory = 'General'
  let isNegative = false
  let sortOrder = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // H3 header = category
    const h3Match = trimmed.match(/^###\s+(.+)$/)
    if (h3Match) {
      currentCategory = h3Match[1].trim()
      isNegative = /should\s+not/i.test(currentCategory) || /negative/i.test(currentCategory)
      continue
    }

    // Bullet item = criterion
    const bulletMatch = trimmed.match(/^-\s+(\[[ x]\]\s+)?(.+)$/)
    if (bulletMatch) {
      const rawText = bulletMatch[2] || ''
      if (rawText.length < 3) continue // skip empty bullets

      const { text, verifiedBy } = extractCriteriaText(trimmed)
      if (!text) continue

      const key = generateCriterionKey(phase, scope, currentCategory, text)
      result.criteria.push({
        key,
        phase,
        scope,
        category: currentCategory,
        text,
        hasVerifiedBy: !!verifiedBy,
        verifiedBy,
        isNegative,
        sortOrder: sortOrder++,
      })
    }
  }

  return result
}

// ── Main entry point ──────────────────────────────────────────────────

export function parseAllSpecs(specsDir: string): ParsedScope[] {
  const scopes: ParsedScope[] = []

  if (!existsSync(specsDir)) return scopes

  const phases = readdirSync(specsDir).filter(d => {
    const full = join(specsDir, d)
    return statSync(full).isDirectory() && (/^p\d+$/.test(d) || d === 'reports')
  })

  for (const phase of phases.sort()) {
    const phaseDir = join(specsDir, phase)
    const scopeDirs = readdirSync(phaseDir).filter(d => {
      const full = join(phaseDir, d)
      return statSync(full).isDirectory()
    })

    for (const scopeDir of scopeDirs.sort()) {
      const specPath = join(phaseDir, scopeDir, 'spec.md')
      const parsed = parseSpecFile(specPath, phase, scopeDir)
      scopes.push(parsed)
    }
  }

  return scopes
}

export { phaseLabel }
