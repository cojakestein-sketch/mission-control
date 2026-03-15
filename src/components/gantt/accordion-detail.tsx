'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Workstream, ScopePipelineStep, PipelineStepKey } from './types'

interface AccordionDetailProps {
  workstream: Workstream
  onTaskToggle: (taskId: string, newStatus: 'todo' | 'done') => void
  onFrdLoaded?: (workstreamId: string, content: string) => void
}

// Pipeline step definitions
const PIPELINE_STEPS: {
  key: PipelineStepKey
  label: string
  number: string
  color: string
  conditional?: boolean
}[] = [
  { key: 'spec', label: 'SPEC', number: '1', color: '#7c3aed' },
  { key: 'frd', label: 'FRD', number: '2', color: '#2563eb' },
  { key: 'design_screens', label: 'DESIGN SCREENS', number: '2a', color: '#db2777', conditional: true },
  { key: 'plan', label: 'PLAN', number: '3', color: '#d97706' },
  { key: 'work', label: 'WORK', number: '4', color: '#d97706' },
  { key: 'review', label: 'REVIEW', number: '5', color: '#d97706' },
  { key: 'compound', label: 'COMPOUND LEARNINGS', number: '6', color: '#d97706' },
  { key: 'merge_pr', label: 'AGENT READY FOR DEV REVIEW', number: '7', color: '#16a34a' },
  { key: 'dev_feedback', label: 'DEV FEEDBACK', number: '8', color: '#dc2626' },
  { key: 'post_dev_fixes', label: 'FIXES & LEARNINGS', number: '9', color: '#d97706' },
  { key: 'merge_status', label: 'MERGED?', number: '10', color: '#16a34a' },
]

const COMPLETED_STATUSES = new Set([
  'ready', 'complete', 'pass', 'submitted', 'approved', 'closed',
  'dev-ready', 'pr_merged',
])

function getStatusBadgeClass(status: string): string {
  if (!status || status === 'empty' || status === 'not_started') {
    return 'border border-gray-300 text-gray-400 bg-transparent'
  }
  if (['draft', 'awaiting', 'awaiting_approval'].includes(status)) {
    return 'bg-yellow-100 text-yellow-700'
  }
  if (COMPLETED_STATUSES.has(status)) {
    return 'bg-green-100 text-green-700'
  }
  if (status === 'fail') {
    return 'bg-red-100 text-red-700'
  }
  if (['pr_open', 'built', 'needs-figma'].includes(status)) {
    return 'bg-blue-100 text-blue-700'
  }
  return 'border border-gray-300 text-gray-400 bg-transparent'
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/-/g, ' ')
}

const DOC_REPO = 'cojakestein-sketch/tryps-docs'

function getStepGitHubUrl(stepKey: PipelineStepKey, pipeline: Workstream['pipeline'], workstream: Workstream): string | null {
  if (stepKey === 'spec') {
    const meta = pipeline.spec?.meta as Record<string, unknown> | null
    const specPath = (meta?.specPath as string) || workstream.specPath
    if (specPath) return `https://github.com/${DOC_REPO}/blob/main/${specPath}`
  }
  if (stepKey === 'frd') {
    const meta = pipeline.frd?.meta as Record<string, unknown> | null
    const frdPath = (meta?.frdPath as string) || workstream.frdPath
    if (frdPath) return `https://github.com/${DOC_REPO}/blob/main/${frdPath}`
  }
  if (stepKey === 'merge_pr') {
    const meta = pipeline.merge_pr?.meta as Record<string, unknown> | null
    return (meta?.prUrl as string) || null
  }
  return null
}

export function AccordionDetail({ workstream, onFrdLoaded }: AccordionDetailProps) {
  const pipeline = workstream.pipeline
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [frdLoading, setFrdLoading] = useState(false)
  const [frdFetched, setFrdFetched] = useState(false)

  // Determine which steps to show
  const visibleSteps = PIPELINE_STEPS.filter(step => {
    if (!step.conditional) return true
    if (step.key === 'design_screens') {
      const ds = pipeline.design_screens
      if (!ds) return false
      if (ds.status === 'not_started') {
        const meta = ds.meta as Record<string, unknown> | null
        const screens = meta?.designScreens as string[] | undefined
        return screens && screens.length > 0
      }
      return true
    }
    return true
  })

  // Count completed
  const completedCount = visibleSteps.filter(step => {
    const s = pipeline[step.key]
    return s && COMPLETED_STATUSES.has(s.status)
  }).length

  const toggleStep = useCallback((key: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // FRD lazy-fetch on expand
  useEffect(() => {
    if (!expandedSteps.has('frd')) return
    const frdStep = pipeline.frd
    const frdMeta = frdStep?.meta as Record<string, unknown> | null
    const frdPath = frdMeta?.frdPath as string | undefined
    if (frdPath && !frdStep?.content && !frdLoading && !frdFetched) {
      setFrdLoading(true)
      setFrdFetched(true)
      fetch(`/api/frd/${workstream.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.frdContent) {
            onFrdLoaded?.(workstream.id, data.frdContent)
          }
        })
        .catch(() => {})
        .finally(() => setFrdLoading(false))
    }
  }, [expandedSteps, pipeline.frd, workstream.id, frdLoading, frdFetched, onFrdLoaded])

  return (
    <div className="bg-white border border-gray-200 rounded-lg mx-2 mb-2 overflow-hidden shadow-sm">
      {/* Pipeline header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Pipeline
        </span>
        <span className="text-[11px] font-medium text-gray-600">
          {completedCount}/{visibleSteps.length} complete
        </span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${visibleSteps.length > 0 ? (completedCount / visibleSteps.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <div className="relative">
        {visibleSteps.map((step, idx) => {
          const pipelineStep = pipeline[step.key]
          const status = pipelineStep?.status || 'not_started'
          const isExpanded = expandedSteps.has(step.key)
          const isCompleted = COMPLETED_STATUSES.has(status)
          const isLast = idx === visibleSteps.length - 1
          const githubUrl = getStepGitHubUrl(step.key, pipeline, workstream)

          return (
            <div key={step.key} className="relative">
              {/* Step row */}
              <div
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => toggleStep(step.key)}
              >
                {/* Circle + connector line */}
                <div className="relative flex flex-col items-center shrink-0" style={{ width: 24 }}>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                    style={{ backgroundColor: isCompleted ? step.color : '#d1d5db' }}
                  >
                    {isCompleted ? (
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                      </svg>
                    ) : step.number}
                  </div>
                  {!isLast && (
                    <div
                      className="absolute top-6 w-0.5"
                      style={{
                        height: isExpanded ? 'calc(100% + 8px)' : 16,
                        backgroundColor: isCompleted ? step.color : '#e5e7eb',
                      }}
                    />
                  )}
                </div>

                {/* Title + inline GitHub link */}
                <span className="text-[11px] font-semibold text-gray-700 tracking-wide flex-1 flex items-center gap-2">
                  {step.label}
                  {githubUrl && (
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[9px] font-medium text-blue-500 hover:text-blue-700 hover:underline"
                    >
                      GitHub &rarr;
                    </a>
                  )}
                </span>

                {/* Status badge */}
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase ${getStatusBadgeClass(status)}`}>
                  {formatStatus(status)}
                </span>

                {/* Chevron */}
                <svg
                  className={`w-3 h-3 text-gray-400 transition-transform duration-150 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M6 3l5 5-5 5V3z" />
                </svg>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="pl-14 pr-4 pb-3">
                  <StepContent
                    stepKey={step.key}
                    step={pipelineStep}
                    workstream={workstream}
                    frdLoading={frdLoading}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Step-specific content rendering
function StepContent({
  stepKey,
  step,
  workstream,
  frdLoading,
}: {
  stepKey: PipelineStepKey
  step: ScopePipelineStep | null
  workstream: Workstream
  frdLoading: boolean
}) {
  const meta = step?.meta as Record<string, unknown> | null
  const docRepo = 'cojakestein-sketch/tryps-docs'

  switch (stepKey) {
    case 'spec': {
      const specPath = (meta?.specPath as string) || workstream.specPath
      const specContent = step?.content || workstream.specContent
      const specFileName = specPath || `scopes/${workstream.id}/spec.md`

      if (specContent) {
        return (
          <div>
            <div className="text-xs text-gray-700 max-h-48 overflow-y-auto prose prose-xs">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(specContent) }} />
            </div>
          </div>
        )
      }
      return (
        <div className="text-center py-3">
          <p className="text-xs text-gray-400 mb-2">Spec not created yet</p>
          <CopyPromptButton
            color="purple"
            label="Start Spec Interview"
            prompt={buildSpecPrompt(workstream.name, workstream.id, specFileName)}
          />
          <p className="text-[9px] text-gray-400 mt-1.5">Copies a prompt to your clipboard. Paste into Claude Code.</p>
        </div>
      )
    }

    case 'frd': {
      const frdPath = (meta?.frdPath as string) || workstream.frdPath
      const frdContent = step?.content || workstream.frdContent
      const specPath = (workstream.pipeline?.spec?.meta as Record<string, unknown> | null)?.specPath as string | undefined
        || workstream.specPath
      const frdFileName = frdPath || `scopes/${workstream.id}/frd.md`
      const hasSpec = !!(workstream.pipeline?.spec?.content || workstream.specContent)

      if (frdLoading) {
        return (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Fetching FRD...
          </div>
        )
      }

      if (frdContent) {
        return (
          <div>
            <div className="text-xs text-gray-700 max-h-48 overflow-y-auto prose prose-xs">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(frdContent) }} />
            </div>
          </div>
        )
      }

      if (!hasSpec) {
        return (
          <div className="text-center py-3">
            <p className="text-xs text-gray-400 mb-1">Complete the Spec first — the FRD is auto-generated from it.</p>
            <p className="text-[9px] text-gray-400">The Spec interview prompt (Step 1) will auto-trigger FRD generation.</p>
          </div>
        )
      }

      return (
        <div className="text-center py-3">
          <p className="text-xs text-gray-400 mb-2">Spec is ready — generate the FRD and save it here</p>
          <CopyPromptButton
            color="blue"
            label="Generate FRD"
            prompt={buildFrdPrompt(workstream.name, workstream.id, specPath || '', frdFileName)}
          />
          <p className="text-[9px] text-gray-400 mt-1.5">Copies a prompt to your clipboard. Paste into Claude Code. The FRD will be saved into this pipeline section.</p>
        </div>
      )
    }

    case 'design_screens': {
      const status = step?.status || 'not_started'
      const screens = (meta?.designScreens as string[]) || []
      const routing = meta?.routing as string | undefined

      if (status === 'not_started') {
        return (
          <div className="text-center py-3">
            <p className="text-xs text-gray-400">Run <code className="text-[10px] bg-gray-100 px-1 py-0.5 rounded">/pencil</code> to generate design screens</p>
          </div>
        )
      }

      return (
        <div className="space-y-2">
          {screens.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Screens</p>
              <div className="flex flex-wrap gap-1">
                {screens.map(s => (
                  <span key={s} className="text-[10px] bg-pink-50 text-pink-700 px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}
          {routing === 'dev-ready' && (
            <p className="text-[10px] text-green-600 font-medium">Designs approved for dev reference</p>
          )}
          {routing === 'needs-figma' && (
            <p className="text-[10px] text-yellow-600 font-medium">Routed to Figma designers</p>
          )}
        </div>
      )
    }

    case 'merge_pr': {
      const prUrl = meta?.prUrl as string | undefined
      const prNumber = meta?.prNumber as number | undefined
      const clickupTaskId = meta?.clickupTaskId as string | undefined
      const assignedDevId = meta?.assignedDevId as string | undefined
      const devBriefing = meta?.devBriefing as string | undefined

      if (!step || step.status === 'not_started') {
        return <EmptyState text="No PR created yet" />
      }

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {prUrl && (
              <a href={prUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-medium text-blue-600 hover:underline">
                PR #{prNumber || 'link'}
              </a>
            )}
            {clickupTaskId && (
              <span className="text-[9px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">ClickUp: {clickupTaskId}</span>
            )}
            {assignedDevId && (
              <span className="text-[9px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">@{assignedDevId}</span>
            )}
          </div>
          {devBriefing && (
            <div className="text-xs text-gray-700 max-h-32 overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(devBriefing) }} />
            </div>
          )}
        </div>
      )
    }

    case 'dev_feedback': {
      const assignedDevId = (pipeline_meta_from_merge(step, workstream) || 'dev')
      if (!step || step.status === 'awaiting') {
        return (
          <div className="text-center py-3">
            <p className="text-xs text-gray-400">Waiting for dev feedback from <span className="font-medium">{assignedDevId}</span>...</p>
          </div>
        )
      }
      if (step.content) {
        return (
          <div>
            <p className="text-[10px] text-gray-500 mb-1">
              By {(meta?.feedbackAuthor as string) || 'dev'} {meta?.submittedAt ? `on ${new Date(meta.submittedAt as string).toLocaleDateString()}` : ''}
            </p>
            <div className="text-xs text-gray-700 max-h-32 overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(step.content) }} />
            </div>
          </div>
        )
      }
      return <EmptyState text="No feedback yet" />
    }

    case 'merge_status': {
      if (!step || step.status === 'awaiting_approval') {
        return (
          <div className="text-center py-3">
            <p className="text-xs text-gray-400">Awaiting approval</p>
          </div>
        )
      }
      if (step.status === 'approved' || step.status === 'closed') {
        const approvedBy = meta?.approvedBy as string | undefined
        const approvedAt = meta?.approvedAt as string | undefined
        return (
          <div className="flex items-center gap-2 py-2">
            <svg className="w-4 h-4 text-green-500" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
            <span className="text-xs text-green-700 font-medium">
              {step.status === 'closed' ? 'Scope complete' : `Approved by ${approvedBy || 'team'}`}
              {approvedAt && ` on ${new Date(approvedAt).toLocaleDateString()}`}
            </span>
          </div>
        )
      }
      return <EmptyState text="Not started" />
    }

    case 'work': {
      const filesChanged = (meta?.filesChanged as string[]) || []
      return (
        <div className="space-y-2">
          {step?.content && (
            <div className="text-xs text-gray-700 max-h-32 overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(step.content) }} />
            </div>
          )}
          {filesChanged.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Files changed</p>
              <div className="space-y-0.5">
                {filesChanged.map(f => (
                  <p key={f} className="text-[10px] text-gray-600 font-mono">{f}</p>
                ))}
              </div>
            </div>
          )}
          {!step?.content && filesChanged.length === 0 && <EmptyState text="Not started" />}
        </div>
      )
    }

    case 'review': {
      if (!step?.content) return <EmptyState text="Not started" />
      const reviewResult = meta?.reviewResult as string | undefined
      return (
        <div>
          {reviewResult && (
            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase mb-2 inline-block ${reviewResult === 'pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {reviewResult}
            </span>
          )}
          <div className="text-xs text-gray-700 max-h-32 overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(step.content) }} />
          </div>
        </div>
      )
    }

    case 'plan': {
      if (!step?.content || step.status === 'not_started') {
        const parts = workstream.id.split('-')
        const phase = parts[0]
        const scopeName = parts.slice(1).join('-')
        const scopePath = `${phase}/${scopeName}`

        return (
          <div className="text-center py-3">
            <p className="text-xs text-gray-400 mb-2">Spec &amp; FRD approved — run the autonomous pipeline</p>
            <CopyPromptButton
              color="amber"
              label="Run Autonomous Pipeline (Steps 3→7)"
              prompt={buildAutonomousPipelinePrompt(workstream.name, workstream.id, scopePath, scopeName)}
            />
            <p className="text-[9px] text-gray-400 mt-1.5">Copies prompt to clipboard. Paste into Claude Code. Runs Plan → Work → Review → Compound → PR autonomously.</p>
          </div>
        )
      }
      return (
        <div>
          {step.generatedAt && (
            <p className="text-[9px] text-gray-400 mb-1">Generated {new Date(step.generatedAt).toLocaleDateString()}</p>
          )}
          <div className="text-xs text-gray-700 max-h-32 overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(step.content) }} />
          </div>
        </div>
      )
    }

    // Generic markdown content steps: compound, post_dev_fixes
    default: {
      if (!step?.content) return <EmptyState text="Not started" />
      return (
        <div>
          {step.generatedAt && (
            <p className="text-[9px] text-gray-400 mb-1">Generated {new Date(step.generatedAt).toLocaleDateString()}</p>
          )}
          <div className="text-xs text-gray-700 max-h-32 overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(step.content) }} />
          </div>
        </div>
      )
    }
  }
}

// Helper: get assigned dev from merge_pr step meta
function pipeline_meta_from_merge(step: ScopePipelineStep | null, workstream: Workstream): string | null {
  const mergePr = workstream.pipeline?.merge_pr
  if (!mergePr?.meta) return null
  const meta = mergePr.meta as Record<string, unknown>
  return (meta.assignedDevId as string) || null
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-xs text-gray-400 italic py-2">{text}</p>
  )
}

function CopyPromptButton({ color, label, prompt }: { color: 'purple' | 'blue' | 'amber' | 'green'; label: string; prompt: string }) {
  const [copied, setCopied] = useState(false)

  const colorClasses = {
    purple: 'text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100',
    blue: 'text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100',
    amber: 'text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100',
    green: 'text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100',
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full transition-colors ${colorClasses[color]}`}
    >
      {copied ? (
        <>
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
          </svg>
          {label}
        </>
      )}
    </button>
  )
}

function buildSpecPrompt(scopeName: string, scopeId: string, specPath: string): string {
  return `You're starting the scope pipeline for "${scopeName}" (${scopeId}).

Run /spec to interview me about this scope. I'll describe what I want and you'll write a structured spec with:
- **Intent**: Why this scope exists (2-3 sentences)
- **Acceptance Criteria**: Checkboxes for what "done" looks like
- **Constraints**: Any technical or timeline constraints

When the spec is complete:
1. Save the spec to the tryps-docs repo at \`${specPath}\`
2. Update Mission Control's pipeline so it appears in the SPEC section:
   curl -X PATCH "https://mc.jointryps.com/api/workstreams/${scopeId}/pipeline/spec" \\
     -H "Content-Type: application/json" \\
     -d "$(jq -n --arg content "$(cat ${specPath})" --arg status ready --arg specPath "${specPath}" '{status: $status, content: $content, meta: {specPath: $specPath}}')"

Then AUTOMATICALLY generate the FRD (Step 2) from the spec — expand my intent into detailed functional requirements: every screen, field, edge case, and API contract. Save the FRD into Mission Control's FRD pipeline section (see FRD prompt instructions).

Let's go — start the interview.`
}

function buildFrdPrompt(scopeName: string, scopeId: string, specPath: string, frdPath: string): string {
  return `Generate the FRD for "${scopeName}" (${scopeId}).

Read the spec at \`${specPath}\` in the tryps-docs repo (or fetch from Mission Control: GET https://mc.jointryps.com/api/workstreams/${scopeId}/pipeline/spec).

Expand the spec into a detailed Functional Requirements Document:
- Every screen referenced (with field lists)
- Edge cases and error states
- API contracts (endpoints, payloads)
- Data model changes needed
- Acceptance test scenarios

When the FRD is complete, save it to BOTH locations:
1. Save to tryps-docs repo at \`${frdPath}\` (for GitHub reference)
2. Save into Mission Control's FRD pipeline section so it's immediately visible:
   curl -X PATCH "https://mc.jointryps.com/api/workstreams/${scopeId}/pipeline/frd" \\
     -H "Content-Type: application/json" \\
     -d "$(jq -n --arg content "$(cat ${frdPath})" --arg status ready --arg frdPath "${frdPath}" '{status: $status, content: $content, meta: {frdPath: $frdPath}}')"

After the FRD is saved, continue the pipeline: suggest running /pencil (Step 2a) if the FRD references UI screens, or /lfg (Steps 3-6) if it's backend-only.`
}

function buildAutonomousPipelinePrompt(scopeName: string, scopeId: string, scopePath: string, feature: string): string {
  const scopeDir = `/Users/jakestein/tryps-docs/scopes/${scopePath}`
  const branch = `feat/${feature}`

  return `Run the autonomous scope pipeline for "${scopeName}" (${scopeId}), Steps 3→7.

The spec and FRD are already approved:
- ${scopeDir}/spec.md
- ${scopeDir}/frd.md

## How to Run Each Step

Each step MUST run as a separate \`claude -p\` session for context isolation. For each step:

1. Write the substituted prompt to a temp file
2. Run \`claude -p\` reading from that file

\`\`\`bash
sed 's|{{FEATURE}}|${feature}|g; s|{{SCOPE_DIR}}|${scopeDir}|g; s|{{BRANCH}}|${branch}|g; s|{{WORKSTREAM_ID}}|${scopeId}|g' _private/tools/vision/prompts/{TEMPLATE} > /tmp/pipeline-prompt.txt
claude -p "$(cat /tmp/pipeline-prompt.txt)" --add-dir /Users/jakestein/tryps-docs --max-turns {N} --permission-mode bypassPermissions
\`\`\`

CRITICAL:
- \`--add-dir /Users/jakestein/tryps-docs\` is REQUIRED — without it the child session cannot read/write scope docs.
- \`--permission-mode bypassPermissions\` is REQUIRED — \`claude -p\` is non-interactive and cannot prompt for file write permissions.
- Do NOT use \`--output-format text\` — it causes the subprocess to buffer all output and appear frozen.
- Do NOT pipe through \`tee\` — it can cause hangs.
- Set Bash timeout to 600000 (10 min) for each \`claude -p\` call.
- Do NOT read the templates yourself — \`sed\` handles substitution. Just run the commands above.
- Do NOT open files in Marked 2 or any other app during Steps 3-6. Only open agent-ready.md after Step 7 completes.

## Steps (run in order)

| # | Template | Max Turns | Output | Verify |
|---|----------|-----------|--------|--------|
| 3 | plan.md | 30 | ${scopeDir}/plan.md | >300 bytes |
| 4 | work.md | 100 | ${scopeDir}/work-log.md + code on \`${branch}\` | Branch exists, typecheck passes |
| 5 | review.md | 40 | ${scopeDir}/review.md | File exists |
| 6 | compound.md | 50 | ${scopeDir}/compound-log.md | File exists, typecheck passes |
| 7 | agent-ready.md | 20 | ${scopeDir}/agent-ready.md | PR URL in file |

If Step 5 review verdict is FAIL, re-run Steps 4→5. Max 2 retries.

## After Each Step

1. Verify the output file exists and meets the size/content check
2. Update Mission Control:
\`\`\`bash
curl -s -X PATCH -H "Authorization: Bearer $(cat ~/.mission-control-api-key)" -H "Content-Type: application/json" "https://mc.jointryps.com/api/workstreams/${scopeId}/pipeline/{step_key}" -d '{"status": "complete"}'
\`\`\`
3. Print: [pipeline] ✓ Step N: {name} complete
4. If failed: [pipeline] ✗ Step N: {name} FAILED — print last 20 lines of log, stop.

## After Step 7

Print the final report with all artifact paths and PR URL.
Open ${scopeDir}/agent-ready.md in Marked 2.

Do NOT ask me anything. Run all steps autonomously.`
}

// Very simple markdown to HTML (headers, bold, lists, code)
function simpleMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-gray-800 mt-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold text-gray-800 mt-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-gray-900 mt-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="text-[10px] bg-gray-100 px-1 py-0.5 rounded">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-3">$1</li>')
    .replace(/\n/g, '<br/>')
}
