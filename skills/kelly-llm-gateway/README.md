# LLM Gateway Cost & Governance Desk

A generic, brand-free App-in-Skill dashboard for a platform team routing many
internal services through one shared LLM gateway to a mix of internal and
external models. It aggregates cost, call volume, error rate, and canary
rollout status into one local file-backed view, and lets a human record
promote / rollback / hold decisions and acknowledge cost/error anomalies —
all as local handoff files, never as a change to a real routing config.

## What It Shows

- Overview: total daily spend trend over 14 days, a canary-rollout summary,
  and a preview of open cost/error anomalies.
- Cost Breakdown: sortable service × model table (calls, cost, error rate,
  canary %, status), broken down by consuming service and backing model.
- Rollouts: canary rollout status board — canary percentage, rollback
  readiness, an optional note, and `Promote to 100%` / `Rollback` / `Hold`
  actions.
- Anomalies: cost and error-rate spikes computed **deterministically** against
  each route's own rolling baseline (mean of the preceding days) — no
  randomness, no ML — with an acknowledgement action.

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

Run the app and open a safe mock-data scene:

```bash
skills/kelly-llm-gateway/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=1&lang=en#/overview
/?demo=spend&lang=en#/spend
/?demo=rollouts&lang=en#/rollouts
/?demo=anomalies&lang=en#/anomalies
```

Add `lang=zh` for the Chinese UI chrome, e.g. `/?demo=1&lang=zh#/overview`.

Demo mode is fully offline: it never reads live gateway data or local private
files, and rollout/acknowledge actions taken while `?demo=` is set only update
in-memory state in the browser tab — they never write
`app/.data/decisions.json`.

## Seeding Real Local Data

Without any config, seed a deterministic snapshot so the dashboard has
something to render:

```bash
node skills/kelly-llm-gateway/scripts/seed_snapshot.ts
node skills/kelly-llm-gateway/scripts/validate_ui_schema.ts skills/kelly-llm-gateway/app/.data/snapshot.json
```

## Private Config

Copy `config.example.json` to `config.local.json` or
`~/.config/kelly-llm-gateway/config.json`. Put a gateway API key in local env
files only, referenced by env var name in config (`gateway.api_key_env`).
Never commit real credentials, exports, or files under `app/.data/`.
