import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

/**
 * Insert a criterion bullet under a specific H3 category in a spec file.
 */
export function addCriterionToSpec(
  specsDir: string,
  phase: string,
  scope: string,
  categoryName: string,
  text: string
): void {
  const specPath = join(specsDir, phase, scope, 'spec.md')
  if (!existsSync(specPath)) throw new Error(`Spec not found: ${specPath}`)

  const content = readFileSync(specPath, 'utf8')
  const lines = content.split('\n')

  // Find criteria section
  const criteriaIdx = lines.findIndex(l =>
    /^##\s+(Acceptance Criteria|Success Criteria)\s*$/i.test(l)
  )
  if (criteriaIdx === -1) throw new Error('No criteria section found in spec')

  // Find the target category H3
  let categoryIdx = -1
  for (let i = criteriaIdx + 1; i < lines.length; i++) {
    if (/^##\s+[^#]/.test(lines[i])) break
    if (/^###\s+/.test(lines[i])) {
      const catName = lines[i].replace(/^###\s+/, '').trim()
      if (catName === categoryName) {
        categoryIdx = i
        break
      }
    }
  }

  if (categoryIdx === -1) throw new Error(`Category not found: ${categoryName}`)

  // Find the last bullet in this category (before next H2/H3 or EOF)
  let insertIdx = categoryIdx + 1
  for (let i = categoryIdx + 1; i < lines.length; i++) {
    if (/^#{2,3}\s+/.test(lines[i])) break
    if (/^-\s+/.test(lines[i].trim())) {
      insertIdx = i + 1
    }
  }

  lines.splice(insertIdx, 0, `- ${text}`)
  writeFileSync(specPath, lines.join('\n'), 'utf8')
}

/**
 * Add a new H3 category to the end of the criteria section.
 */
export function addCategoryToSpec(
  specsDir: string,
  phase: string,
  scope: string,
  categoryName: string
): void {
  const specPath = join(specsDir, phase, scope, 'spec.md')
  if (!existsSync(specPath)) throw new Error(`Spec not found: ${specPath}`)

  const content = readFileSync(specPath, 'utf8')
  const lines = content.split('\n')

  const criteriaIdx = lines.findIndex(l =>
    /^##\s+(Acceptance Criteria|Success Criteria)\s*$/i.test(l)
  )
  if (criteriaIdx === -1) throw new Error('No criteria section found in spec')

  // Find end of criteria section (next H2 or EOF)
  let endIdx = lines.length
  for (let i = criteriaIdx + 1; i < lines.length; i++) {
    if (/^##\s+[^#]/.test(lines[i])) {
      endIdx = i
      break
    }
  }

  lines.splice(endIdx, 0, '', `### ${categoryName}`, '')
  writeFileSync(specPath, lines.join('\n'), 'utf8')
}

/**
 * Create a new scope directory with a minimal spec.md template.
 */
export function addScopeSpec(
  specsDir: string,
  phase: string,
  scopeSlug: string,
  scopeLabel: string
): void {
  const scopeDir = join(specsDir, phase, scopeSlug)
  if (existsSync(scopeDir)) throw new Error(`Scope already exists: ${scopeSlug}`)

  const phaseDir = join(specsDir, phase)
  if (!existsSync(phaseDir)) {
    mkdirSync(phaseDir, { recursive: true })
  }

  mkdirSync(scopeDir, { recursive: true })

  const template = [
    `# ${scopeLabel}`,
    '',
    '## Overview',
    '',
    '_To be written._',
    '',
    '## Success Criteria',
    '',
    '### General',
    '',
  ].join('\n')

  writeFileSync(join(scopeDir, 'spec.md'), template, 'utf8')
}
