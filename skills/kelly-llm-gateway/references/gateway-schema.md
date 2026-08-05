# Kelly LLM Gateway Schema

Use this schema when reading or writing Kelly LLM Gateway's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/gateway-model.js`). `calls_today`, `cost_today`,
`error_rate_today`, `cost_baseline`, and `error_rate_baseline` are computed
client-side from a route's own `daily` field on every read — they are never
stored. This is a generic, brand-free dataset: no real company/product names
for services or models, only role-based service names and generic
provider/model labels ("Provider A / Model Large", "Internal Model v2").

## Routes (`kelly-llm-gateway-routes-v1`)

One row per service→model route.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `route-id` | `route_id` | text | stable domain id, required, e.g. `support-bot__internal-model-v2` |
| `service-id` | `service_id` | text | required, foreign key into `services` |
| `model-id` | `model_id` | text | required, foreign key into `models` |
| `status` | `status` | text | `stable\|canary\|rollback\|hold` |
| `canary-pct` | `canary_pct` | number | percentage of this service's traffic on this model |
| `rollback-ready` | `rollback_ready` | text | `"true"\|"false"` (Busabase has no boolean field type) |
| `note` | `note` | longtext | human decision note, set by promote/rollback/hold |
| `daily` | `daily` | longtext | JSON array of `{date, calls, cost, errors}`, ascending by date, last entry is "today"; keep at least 7 days |
| `cost-spike-ack` | `cost_spike_ack` | longtext | JSON `{note, acknowledged_at}` or empty; acknowledgement for this route's `cost_spike` anomaly |
| `error-spike-ack` | `error_spike_ack` | longtext | JSON `{note, acknowledged_at}` or empty; acknowledgement for this route's `error_spike` anomaly |
| `updated-at` | `updated_at` | text | ISO timestamp, set on every write |

Routes enter Busabase through an external process (a future gateway
usage-API adapter) — the AirApp never creates a route record, only updates
an existing one's rollout/ack fields, the same way `kelly-lead-funnel`'s
leads enter through an upstream sourcing process the app doesn't control.

## Services (`kelly-llm-gateway-services-v1`)

One row per consuming service routed through the shared gateway.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `service-id` | `service_id` | text | stable domain id, required |
| `display-name` | `display_name` | text | e.g. `Support Bot` |
| `team` | `team` | text | owning team, e.g. `Customer Ops` |

## Models (`kelly-llm-gateway-models-v1`)

One row per backing model/provider behind the gateway.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `model-id` | `model_id` | text | stable domain id, required |
| `display-name` | `display_name` | text | e.g. `Provider A / Model Large` — always generic, never a real brand |
| `provider` | `provider` | text | e.g. `Provider A`, `Internal` |
| `tier` | `tier` | text | `internal\|external` |

## Settings (`kelly-llm-gateway-settings-v1`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `kelly-llm-gateway-config` | `config` | `{base_currency, cost_spike_threshold_pct, error_spike_threshold_pct, gateway: {region, base_url, api_key_env}}` |

If no `config` row exists, the app falls back to defaults
(`app/app/js/gateway-model.js`'s `DEFAULT_COST_SPIKE_THRESHOLD_PCT` (50),
`DEFAULT_ERROR_SPIKE_THRESHOLD_PCT` (100), and `base_currency: "USD"`) — the
dashboard still functions, just without a configured gateway summary.
`gateway.api_key_env` is informational only (the name of the env var a
future gateway adapter would read); the browser never checks or displays
credential readiness.

## Derived Metrics (computed, never stored)

`deriveRouteMetrics(route)` reads a route's own `daily` series and computes:

- `calls_today` / `cost_today` / `error_rate_today`: the last entry in
  `daily`.
- `cost_baseline` / `error_rate_baseline`: the mean over the preceding
  entries in `daily` (excluding today) — the rolling baseline anomalies
  compare "today" against.

`buildTotals(routes)` rolls these up portfolio-wide: `calls_today` /
`cost_today` are sums across routes; `cost_7d_avg` is the sum over routes of
each route's own trailing-7-day daily average; `error_rate_today` is total
errors today / total calls today. `buildSpendTrend(routes)` sums `cost` per
calendar date across all routes' `daily` series.

## Anomalies (computed, never stored)

`computeAnomalies(routes, costThresholdPct, errorThresholdPct)` in
`app/app/js/gateway-model.js` flags a `cost_spike` and/or `error_spike` per
route: today's `cost`/`error_rate` compared against that route's own rolling
baseline. No randomness; re-computing from the same `daily` data always
produces the same anomalies. Default thresholds (overridable via
`settings`): `cost_spike_threshold_pct: 50`, `error_spike_threshold_pct:
100` — i.e. cost ≥1.5x baseline, or error rate ≥2x baseline. Severity is
`high` at 2x the threshold, otherwise `watch`.

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

Anomaly ids are deterministic (`cost-spike-<route_id>` /
`error-spike-<route_id>`), so `parseAnomalyId(id)` recovers which route and
kind an acknowledgement write applies to without a lookup table.
`applyAnomalyAcks(anomalies, routesById)` merges each route's stored
`cost-spike-ack`/`error-spike-ack` field onto the matching computed anomaly.

## Direct Rollout & Anomaly Writes

There is no decisions/approval bucket. Every human action writes straight
onto the route's own record via `records.changeRequest`:

- **Promote** (`decideRollout(routeId, "promote", note)`): sets `status:
  stable`, `canary_pct: 100`, `rollback_ready: false`, and `note`.
- **Rollback** (`decideRollout(routeId, "rollback", note)`): sets `status:
  rollback`, `rollback_ready: false`, and `note`.
- **Hold** (`decideRollout(routeId, "hold", note)`): sets `status: hold` and
  `note` only — `canary_pct`/`rollback_ready` are untouched.
- **Acknowledge an anomaly** (`ackAnomaly(anomalyId, note)`): writes
  `{note, acknowledged_at}` onto the route's `cost_spike_ack` or
  `error_spike_ack` field, whichever the anomaly's `kind` refers to.

From a standalone local preview the write merges immediately (trusted
operator); from the deployed AirApp it creates a pending ChangeRequest for
the trusted process to merge, per the AirApp boundary in
`$busabase-app-creator`.
