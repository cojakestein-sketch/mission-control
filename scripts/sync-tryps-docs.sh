#!/bin/bash
# Sync tryps-docs: pull latest from GitHub, commit+push any local changes
# Run from host (not inside container) — called by cron or API trigger

DOCS_DIR="/home/openclaw/tryps-docs"
cd "$DOCS_DIR" || exit 1

# Stash any local changes, pull, then re-apply
git add -A
if git diff --cached --quiet; then
  # No local changes — just pull
  git pull --rebase origin main 2>&1
else
  # Local changes exist — commit and push
  git commit -m "chore: auto-sync criteria updates from tracker" 2>&1
  git pull --rebase origin main 2>&1
  git push origin main 2>&1
fi

echo "SYNC_OK $(date -u +%Y-%m-%dT%H:%M:%SZ)"
