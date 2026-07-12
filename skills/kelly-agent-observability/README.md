# Agent Fleet Observability Desk

Agent Fleet Observability Desk is a local App-in-Skill dashboard that
visualizes a MOCK fleet of LLM agents running behind a shared AI gateway for a
generic organization. It is a demo/reference dashboard over generated mock
telemetry — there is no real gateway, no real agents, and no external network
calls anywhere in this skill.

## What It Shows

- **Fleet Overview**: total calls (24h), total cost (today), counts of
  degraded/critical/healthy agents, and a card grid — one per agent — with a
  call-volume sparkline.
- **Agent Health**: a sortable table across call volume, p50/p95 latency,
  error/failure rate, cost per call, daily cost, and a status badge
  (healthy / degraded / critical) per agent.
- **Trace Detail**: an ordered step timeline (tool calls) for one trace, with
  the exact step where the chain broke visually flagged.
- **Human-in-the-loop handoffs**: acknowledge an agent or trace, or flag it as
  "needs investigation", with a free-text note. This is a real API call
  (`POST /api/handoffs`) that appends to a local, gitignored
  `app/.data/handoffs.jsonl` file — no external network calls.

The mock fleet includes 8 generic agent archetypes: Booking Assistant, Support
Triage, Expense Approval, Itinerary Planner, Compliance Check, Vendor
Sourcing, Meeting Scheduler, and Contract Summarizer.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Fleet overview"></td>
    <td width="50%"><img src="assets/screenshots/agent-health.webp" alt="Agent health table"></td>
  </tr>
  <tr>
    <td><strong>Fleet Overview</strong><br>Total calls, total cost, degraded/critical/healthy agent counts, and a per-agent sparkline card grid.</td>
    <td><strong>Agent Health</strong><br>Sortable table with call volume, p50/p95 latency, error rate, cost, and a status badge per agent.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/trace-detail.webp" alt="Trace detail with chain break"></td>
    <td width="50%"><img src="assets/screenshots/handoff.webp" alt="Handoff submitted"></td>
  </tr>
  <tr>
    <td><strong>Trace Detail</strong><br>Ordered step timeline for one trace; the step where the chain broke is visually flagged in red.</td>
    <td><strong>Handoff</strong><br>Submitting a "needs investigation" note from the trace detail view; it is recorded locally.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.zh-CN.webp" alt="Fleet overview in Chinese"></td>
    <td width="50%"><img src="assets/screenshots/agent-health.zh-CN.webp" alt="Agent health table in Chinese"></td>
  </tr>
  <tr>
    <td><strong>Chinese UI — Overview</strong><br>Full zh-CN chrome via the language toggle or <code>lang=zh</code>.</td>
    <td><strong>Chinese UI — Agent Health</strong><br>The sortable health table with zh-CN labels.</td>
  </tr>
</table>

## Getting Started

```bash
skills/kelly-agent-observability/app/start.sh
```

First run installs `hono` and `@hono/node-server`, then seeds mock telemetry
into `app/.data/fleet.json` if it doesn't exist yet. The frontend is
zero-build vanilla JS/HTML/CSS. Open the URL the launcher prints (local host,
port `3100`–`4100`).

To regenerate mock telemetry at any time:

```bash
node skills/kelly-agent-observability/scripts/generate_fleet_data.ts
```

## Demo Mode

Run the app and open a safe mock-data scene without touching
`app/.data/fleet.json`:

```text
/?demo=1&lang=en#/overview
/?demo=agents&lang=en#/agents
/?demo=trace&lang=en#/traces/<any-error-trace-id>
```

`lang=en` / `lang=zh` force the UI chrome language for screenshots or
documentation; the language selector in the sidebar does the same at runtime,
persisted in `localStorage`. Demo mode is fully offline and never reads or
writes local files.

## Local Files

- `app/.data/fleet.json`: generated mock telemetry (agents, per-agent metrics,
  hourly buckets, traces). Gitignored; regenerate any time via the seed
  script.
- `app/.data/handoffs.jsonl`: append-only human-in-the-loop handoff log
  written by `POST /api/handoffs`. Gitignored.

See `references/fleet-schema.md` for the full data shapes.

## API

- `GET /api/state` — bootstrap payload used by the frontend (fleet + summary
  + handoffs, or the demo payload when `?demo=...` is set).
- `GET /api/fleet/summary` — fleet-wide totals and status counts.
- `GET /api/agents` — one row per agent with its latest metrics.
- `GET /api/agents/:agentId` — agent detail, metrics, and recent traces.
- `GET /api/traces/:traceId` — full step timeline for one trace.
- `GET /api/handoffs` — handoff history.
- `POST /api/handoffs` — record an acknowledge / needs-investigation note
  (the only mutating endpoint; local file only, no network calls).
