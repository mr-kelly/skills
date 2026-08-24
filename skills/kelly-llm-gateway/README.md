# LLM Gateway Cost & Governance Desk

LLM Gateway Cost & Governance Desk is a Busabase-backed App-in-Skill operator
dashboard for a platform team routing many internal services through one
shared LLM gateway to a mix of internal and external models. It aggregates
cost, call volume, error rate, and canary rollout status, computes
deterministic cost/error anomalies, and lets a human record promote /
rollback / hold decisions and acknowledge anomalies — all direct, immediate
writes to Busabase. It never calls a live gateway API or changes a real
routing config.

## What It Shows

- **Overview**: total daily spend trend over 14 days, a canary-rollout
  summary, and a preview of open cost/error anomalies.
- **Cost Breakdown**: sortable service × model table (calls, cost, error
  rate, canary %, status), broken down by consuming service and backing
  model.
- **Rollouts**: canary rollout status board — canary percentage, rollback
  readiness, an optional note, and `Promote to 100%` / `Rollback` / `Hold`
  actions, written directly to Busabase.
- **Anomalies**: cost and error-rate spikes computed **deterministically**
  against each route's own rolling baseline (mean of the preceding days) —
  no randomness, no ML — with a direct acknowledgement action.

Services and models in the seed data are intentionally generic: role-based
service names ("Support Bot", "Search Ranking") and generic provider/model
labels ("Provider A / Model Large", "Internal Model v2"). No real company or
product name appears anywhere.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Gateway overview"></td>
    <td width="50%"><img src="assets/screenshots/cost-breakdown.webp" alt="Gateway cost breakdown"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Total daily spend trend, a canary-rollout summary, and a top anomalies preview.</td>
    <td><strong>Cost Breakdown</strong><br>Sortable service × model table: calls, cost, error rate, canary %, status.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/rollouts.webp" alt="Gateway rollouts"></td>
    <td width="50%"><img src="assets/screenshots/anomalies.webp" alt="Gateway anomalies"></td>
  </tr>
  <tr>
    <td><strong>Rollouts</strong><br>Canary-rollout status board with rollback readiness and promote/rollback/hold actions.</td>
    <td><strong>Anomalies</strong><br>Deterministic cost/error spikes vs each route's own rolling baseline, with acknowledgement.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe, fully offline mock scene:

```bash
pnpm --dir skills/kelly-llm-gateway/content/kelly-llm-gateway-app dev
```

Use the printed local URL, then add one of these demo paths:

```text
/?demo=1&lang=en#/overview
/?demo=spend&lang=en#/spend
/?demo=rollouts&lang=en#/rollouts
/?demo=anomalies&lang=en#/anomalies
```

Add `lang=zh` for the Chinese UI chrome, e.g. `/?demo=1&lang=zh#/overview`.

Demo mode is fully offline (4 services, 5 models, 8 routes, 14 days of
history, ported verbatim from the retired `lib/data-provider/seed-data.ts`)
and never reads or writes Busabase; rollout/acknowledge actions taken while
`?demo=` is set only update in-memory state in the browser tab.

## Busabase Data

The AirApp is Busabase-backed: routes, services, models, and settings all
live in Busabase Bases declared in `content/kelly-llm-gateway-app/app/js/config.js` (see
`references/gateway-schema.md`). Resources provision lazily on first run.
There is no local file storage and no separate provider choice.
