# Persistent Agent Investigation

**Date:** 2026-03-12
**Author:** Jake Stein (via Claude Code)
**Status:** Research Complete

---

## Background

Marty currently operates as a **cron-based agent** on OpenClaw, executing scheduled tasks and responding to Slack messages. This document investigates the trade-offs of moving to a **persistent (always-on) agent** model.

## Current Architecture: Cron-Based

### How It Works

Marty runs via OpenClaw's cron scheduler with 8 configured jobs:

| Job | Schedule | Model | Avg Duration |
|-----|----------|-------|-------------|
| Morning Brief | 8am M-F | Sonnet | ~108s |
| Daily Standup | 9am M-F | Opus (default) | ~88s |
| Afternoon Check | 2pm M-F | Opus (default) | ~73s |
| Evening Wrap | 5:45pm M-F | Opus (default) | — |
| Ticket Reminder | 8am daily | Opus (default) | ~4s |
| Dashboard Data | periodic | Sonnet | ~120s |
| Workplan Recommend | 1pm M/W/F | Sonnet | — |
| Asif Points Reminder | periodic | Opus (default) | — |

### Estimated Cost

- **Active cron runs:** ~5-8 per weekday = ~35-50 runs/week
- **Average tokens per run:** ~5,000 input + ~2,500 output
- **Slack responses:** ~10-20/day, similar token usage
- **Estimated daily cost:** $2-5/day (~$50-100/month)
- **Token breakdown:** ~60% Sonnet ($3/$15 per 1M), ~40% Opus ($15/$75 per 1M)

### Strengths

- Predictable costs — bounded by schedule
- No idle resource consumption
- Simple failure model — retry on next schedule
- Sufficient for current team size (5 developers)

### Weaknesses

- **Latency:** Slack messages wait for agent wake-up (~10-30s cold start)
- **No real-time reactions:** Can't watch GitHub webhooks, ClickUp updates, or deployment events as they happen
- **Batch-only processing:** Morning brief compiles overnight changes, misses intra-day context
- **No persistent state across runs:** Each cron run starts fresh (relies on memory files + sqlite embeddings)

## Persistent Agent Model

### What Is "Docking"?

In OpenClaw, **docking** refers to registering an agent with the gateway via `POST /api/agents`. A docked agent:

1. Maintains a persistent WebSocket connection to the gateway
2. Receives real-time events (Slack messages, GitHub webhooks, channel events)
3. Can be invoked immediately without cold start
4. Shares the gateway's event bus with other agents

OpenClaw's current architecture on our server uses `gateway.mode: "local"` with `gateway.bind: "loopback"`, meaning the gateway runs locally and only accepts connections from localhost. The `controlUi` is exposed via Caddy reverse proxy at `marty.jointryps.com`.

### How a Persistent Agent Would Work

```
GitHub Webhook → OpenClaw Gateway → Marty (always listening)
Slack Message  → OpenClaw Gateway → Marty (instant response)
ClickUp Event  → OpenClaw Gateway → Marty (real-time triage)
```

vs current:

```
GitHub Webhook → (ignored until next cron)
Slack Message  → OpenClaw Gateway → Marty (cold start ~15s)
ClickUp Event  → (ignored until morning brief)
```

### Estimated Cost: Persistent

- **Always-on compute:** Not a factor — Marty runs on our Hetzner CCX23 ($35/mo) which is already provisioned
- **Token usage increase:** Real-time responses mean more interactions
  - Current: ~50-80 API calls/day
  - Persistent: ~150-300 API calls/day (3-4x increase from real-time reactions)
  - GitHub webhook reactions: ~20-50/day (PR events, push events, issue changes)
  - Slack instant responses: ~30-60/day (vs batched)
- **Estimated daily cost:** $8-20/day (~$200-500/month)
- **Context window costs:** Persistent agents maintain context, reducing re-fetching but increasing per-call token counts

### Productivity Gains

| Capability | Cron (current) | Persistent |
|-----------|----------------|------------|
| Slack response time | 10-30s cold start | <2s |
| PR review trigger | Next cron cycle | Instant on PR open |
| Bug triage | Morning batch | Real-time on creation |
| Deploy monitoring | Not possible | Watch CI/CD in real-time |
| Context continuity | Fresh each run | Maintains session context |
| Proactive alerts | Scheduled only | Event-driven |

### Risk Factors

1. **Cost unpredictability:** Event-driven = usage scales with activity. A busy day with many PRs could spike costs.
2. **Error amplification:** A bug in persistent mode runs continuously vs. isolated cron runs that fail independently.
3. **Gateway stability:** WebSocket connections can drop. OpenClaw handles reconnection, but data race conditions are possible.
4. **Context window pressure:** Long-running sessions accumulate context. OpenClaw's `contextPruning` is configured (mode: cache-ttl, ttl: 5m) but edge cases exist.

## Recommendation

**Stay with cron-based for now. Add targeted webhook handlers for high-value real-time events.**

### Rationale

1. **Cost:** $50-100/mo → $200-500/mo is a 4-5x increase with unclear ROI at current team size (5 devs).
2. **Diminishing returns:** Most value comes from 3 things Marty already does well: morning briefs, PR reviews, and standup compilation. Making these instant adds marginal value.
3. **The 80/20:** Adding a GitHub webhook handler (instant PR review trigger) captures 80% of persistent agent value at ~20% of the cost increase.

### Suggested Next Steps (Not Implementation)

1. **Add GitHub webhook → cron trigger** — When a PR is opened, immediately trigger the `pr-review` cron job instead of waiting for next schedule. OpenClaw supports `wakeMode: "now"` for this.
2. **Monitor actual token costs** — The seeded Cost Tracker data in Mission Control will help. Replace with real gateway data once the token tracking pipeline is connected.
3. **Revisit at 10+ devs** — Persistent mode becomes more valuable when the volume of PRs, Slack messages, and events justifies always-on monitoring.
4. **Experiment with hybrid** — Keep cron for scheduled tasks, add a lightweight persistent listener just for Slack DMs (fastest response time where it matters most).

## Appendix: OpenClaw Configuration Reference

```json
// Current gateway config
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "controlUi": { "enabled": true }
  },
  "cron": {
    "enabled": true,
    "maxConcurrentRuns": 2,
    "sessionRetention": "7d"
  },
  "agents": {
    "defaults": {
      "model": { "primary": "anthropic/claude-opus-4-6" },
      "contextPruning": { "mode": "cache-ttl", "ttl": "5m" },
      "compaction": { "mode": "default" }
    }
  }
}
```

### Server Specs

- **Machine:** Hetzner CCX23 (8 vCPU, 32GB RAM)
- **IP:** 178.156.176.44
- **OS:** Linux (systemd)
- **Services:** OpenClaw gateway, Mission Control (Docker), Caddy reverse proxy
