# LLM Gateway Snapshot Schema

Use this schema for `app/.data/snapshot.json`. Keep the shape stable so the local
app, scripts, and any future gateway data-provider adapter can evolve
independently. This is a generic, brand-free dataset: no real company/product
names for models or providers, only role-based service names and generic
provider/model labels ("Provider A / Model Large", "Internal Model v2").

## Snapshot

```json
{
  "schema_version": "1",
  "snapshot_id": "stable id for this snapshot run",
  "generated_at": "ISO timestamp",
  "base_currency": "USD",
  "services": [],
  "models": [],
  "routes": [],
  "totals": {
    "calls_today": 0,
    "cost_today": 0,
    "cost_7d_avg": 0,
    "error_rate_today": 0
  },
  "spend_trend": [],
  "anomalies": [],
  "warnings": []
}
```

`source` (e.g. `"kelly-llm-gateway"`) is optional metadata and may be included.

## Service

```json
{ "service_id": "support-bot", "display_name": "Support Bot", "team": "Customer Ops" }
```

A consuming service routed through the shared gateway.

## Model

```json
{
  "model_id": "provider-a-model-large",
  "display_name": "Provider A / Model Large",
  "provider": "Provider A",
  "tier": "internal|external"
}
```

A backing model/provider behind the gateway. Keep names generic; never encode a
real brand.

## Route

One service→model pairing:

```json
{
  "route_id": "support-bot__internal-model-v2",
  "service_id": "support-bot",
  "model_id": "internal-model-v2",
  "status": "stable|canary|rollback|hold",
  "canary_pct": 35,
  "rollback_ready": true,
  "note": "optional human note from a rollout decision",
  "daily": [
    { "date": "YYYY-MM-DD", "calls": 0, "cost": 0, "errors": 0 }
  ],
  "calls_today": 0,
  "cost_today": 0,
  "error_rate_today": 0,
  "cost_baseline": 0,
  "error_rate_baseline": 0
}
```

- `daily` is ascending by date; the last entry is "today". Keep at least 7 days,
  the app seeds 14.
- `cost_baseline` / `error_rate_baseline` are the mean over the preceding days
  (excluding today) — the rolling baseline anomalies compare "today" against.
- `canary_pct` is the percentage of that service's traffic on this model.
  `status: "stable"` routes are typically `canary_pct: 0` (fully rolled out) or
  the legacy default path; `status: "canary"` routes are mid-rollout.

## Totals

Portfolio-level aggregates over all routes:

- `calls_today` = sum of route `calls_today`
- `cost_today` = sum of route `cost_today`
- `cost_7d_avg` = sum over routes of each route's own trailing-7-day daily
  average
- `error_rate_today` = total errors today / total calls today

## Spend trend

```json
{ "date": "YYYY-MM-DD", "cost": 0 }
```

One entry per day: total cost across all routes on that date. Used for the
overview spend-trend chart.

## Anomalies

```json
{
  "id": "cost-spike-<route_id>",
  "route_id": "content-summarizer__internal-model-v2",
  "kind": "cost_spike|error_spike",
  "severity": "watch|high",
  "baseline": 0,
  "actual": 0,
  "delta_pct": 0,
  "status": "open|acknowledged",
  "acknowledged_at": "optional ISO timestamp",
  "ack_note": "optional human note"
}
```

Anomalies are computed deterministically by `app/server/anomalies.ts`: a route's
`cost_today` or `error_rate_today` compared against its own rolling baseline
(mean of the preceding days). No randomness; re-running the seed script
produces the same anomalies. Default thresholds (overridable via config):
`cost_spike_threshold_pct: 50`, `error_spike_threshold_pct: 100` — i.e. cost
≥1.5x baseline, or error rate ≥2x baseline.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "route_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

## Decisions (`app/.data/decisions.json`)

Human actions never change a real routing config — they only write this local
handoff file:

```json
{
  "rollouts": {
    "<route_id>": {
      "route_id": "...",
      "action": "promote|rollback|hold",
      "note": "free text",
      "decided_at": "ISO timestamp"
    }
  },
  "anomaly_acks": {
    "<anomaly_id>": {
      "anomaly_id": "...",
      "note": "free text",
      "acknowledged_at": "ISO timestamp"
    }
  }
}
```

Use `scripts/validate_ui_schema.ts app/.data/snapshot.json` before relying on a
snapshot in the UI. `scripts/seed_snapshot.ts` writes a consistent seeded
snapshot to `app/.data/snapshot.json`.
