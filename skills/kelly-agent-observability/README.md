# Agent Fleet Observability Desk

Agent Fleet Observability Desk is a Busabase-backed App-in-Skill dashboard
that visualizes a generated MOCK fleet of LLM agents running behind a shared
AI gateway for a generic organization. It is a demo/reference dashboard —
there is no real gateway, no real agents, and no external network calls
anywhere in this skill. The fleet snapshot is generated deterministically and
seeded into Busabase by a trusted script; the AirApp only ever reads it.

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
  "needs investigation", with a free-text note — written as a brand-new row
  in the `handoffs` Busabase Base. This is the only Base the AirApp itself
  ever writes to.

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
    <td><strong>Handoff</strong><br>Submitting a "needs investigation" note from the trace detail view; it is recorded as a new row in Busabase.</td>
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
node skills/kelly-agent-observability/scripts/generate_fleet_data.mjs --apply
pnpm --dir skills/kelly-agent-observability/app dev
```

The seed script writes the mock fleet (agents + traces) into Busabase; the
AirApp reads it on every load. Re-run the seed script any time to refresh the
snapshot with a new "now" (the same seed still reproduces the same relative
shape).

## Demo Mode

Run the app and open a safe mock-data scene without touching Busabase:

```text
/?demo=1&lang=en#/overview
/?demo=agents&lang=en#/agents
/?demo=trace&lang=en#/traces/<any-error-trace-id>
```

`lang=en` / `lang=zh` force the UI chrome language for screenshots or
documentation; the language selector in the sidebar does the same at runtime,
persisted in `localStorage`. Demo mode is fully offline and never reads or
writes Busabase.

## Busabase Data

The AirApp is Busabase-backed: agents, traces, handoffs, and settings all
live in Busabase Bases declared in `app/app/js/config.js` (see
`references/fleet-schema.md`). Agents and traces are seeded only by the
trusted `scripts/generate_fleet_data.mjs` script; the AirApp itself only ever
writes new rows to the `handoffs` Base. Resources provision lazily on first
run. There is no local file storage and no separate provider choice.

## API Surface (app-internal)

- `busabaseProvider.getState()` — bootstrap payload used by the frontend
  (fleet + summary + handoffs, or the demo payload when `?demo=...` is set).
- `busabaseProvider.submitHandoff(...)` — record an acknowledge /
  needs-investigation note as a new `handoffs` row (the only mutating call;
  Busabase only, no network calls to any other system).
