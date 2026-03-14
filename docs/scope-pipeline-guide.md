# Scope Pipeline: How to Run Each Step

Every scope in Mission Control has a 10-step pipeline. Each step flows into the next. You start with a spec interview and the rest cascades.

---

## The Key Distinction

**SPEC** = Your intent (you write it via interview). Why this exists, what "done" looks like.
**FRD** = Auto-generated from the spec by Claude. Detailed screens, fields, edge cases. You review, not write.

---

## Step 1 — SPEC (You + Claude interview)

Click **"Start Spec Interview"** in Mission Control. It copies a prompt to your clipboard.
Paste it into Claude Code. Claude interviews you:
- What is this scope about?
- What does "done" look like?
- Any constraints?

Claude writes the spec (intent + acceptance criteria) and saves it to GitHub.
**Then it automatically generates the FRD (Step 2).**

---

## Step 2 — FRD (Auto-generated)

Claude reads your spec and expands it into a full FRD: every screen, every field, every edge case, every API contract. You review it and tweak if needed.

If the spec isn't written yet, the FRD button is disabled with "Complete the Spec first."
If the spec exists but no FRD yet, click **"Generate FRD"** to copy the generation prompt.

---

## Step 2a — DESIGN SCREENS (Conditional)

Only appears if the FRD references UI screens.
Run `/pencil` in Claude Code. It reads the FRD and generates .pen design mockups.
Then decide: `dev-ready` (designs are good enough) or `needs-figma` (route to Krisna).

---

## Steps 3-6 — PLAN / WORK / REVIEW / COMPOUND

Run `/lfg` in Claude Code. It chains all four steps automatically:

| Step | What happens |
|------|-------------|
| 3. PLAN | Claude reads the FRD, writes an implementation plan |
| 4. WORK | Claude executes the plan, writes the code |
| 5. REVIEW | Reviewer agents check the code (pass/fail) |
| 6. COMPOUND | Lessons learned are documented for future scopes |

If review fails, Claude fixes and re-reviews. You don't need to intervene.

---

## Step 7 — AGENT READY FOR DEV REVIEW (You)

Agent work is done. Create a PR on GitHub. Create a ClickUp task. Assign to Asif or Nadeem.
Write a dev briefing: key files, specific questions, context.
Paste the PR URL and ClickUp ID into Mission Control.

---

## Step 8 — DEV FEEDBACK (Asif or Nadeem)

The assigned dev reviews the PR, tests the code, and writes structured feedback:
what works, what's broken, what to change. They submit it through the pipeline.

---

## Step 9 — FIXES & LEARNINGS (Claude)

Feed the dev's feedback to Claude Code. It fixes each issue and documents:
- **Fixes Applied** — what changed
- **Learnings for Next Time** — patterns to remember

---

## Step 10 — MERGED? (Dev)

The dev confirms fixes are good, approves, and merges the PR.
Mark as approved in Mission Control. Scope complete.

---

## Quick Reference

| Step | Who | Action | Time |
|------|-----|--------|------|
| 1. Spec | You + Claude | Click button → paste prompt → interview | 15 min |
| 2. FRD | Claude (auto) | Auto-generated from spec | 5 min |
| 2a. Design | Claude | `/pencil` | 20 min |
| 3-6. Plan→Compound | Claude | `/lfg` | 20-40 min |
| 7. Agent Ready | You | GitHub PR + ClickUp task | 10 min |
| 8. Feedback | Dev | PR review | 30 min |
| 9. Fixes | Claude | Read feedback → fix | 15 min |
| 10. Merged | Dev | Approve + merge | 5 min |

**Total per scope:** ~2-3 hours (You: 30 min, Claude: 1h, Dev: 1h)

---

## How to Start

1. Open Mission Control → Gantt view
2. Expand a scope → click Step 1 SPEC → "Start Spec Interview"
3. Paste into Claude Code terminal
4. Follow the interview. Everything cascades from there.
