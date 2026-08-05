# Kelly Agent Observability Schema

Use this schema when reading or writing Kelly Agent Observability's Busabase
Bases. Field slugs are kebab-case in Busabase and normalized to snake_case in
app code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/fleet-model.js`). This is a generic, brand-free mock fleet: no
real company, gateway, or agent product appears anywhere.

## Agents (`kelly-agent-observability-agents-v1`)

One row per mock agent archetype (8 rows). Written only by
`scripts/generate_fleet_data.mjs`; the AirApp never writes here.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `agent-id` | `agent_id` | text | stable domain id, required, e.g. `booking-assistant` |
| `name` | `name` | text | e.g. `Booking Assistant` |
| `description` | `description` | text | one-line generic description |
| `status` | `status` | text | `healthy\|degraded\|critical`, derived by `statusFor(error_rate_pct, p95_latency_ms)` |
| `calls-24h` | `calls_24h` | number | call volume, trailing 24h |
| `calls-48h` | `calls_48h` | number | call volume, trailing 48h |
| `error-rate-pct` | `error_rate_pct` | number | percent, trailing 24h |
| `p50-latency-ms` | `p50_latency_ms` | number | trailing 24h latency samples |
| `p95-latency-ms` | `p95_latency_ms` | number | trailing 24h latency samples |
| `cost-per-call-usd` | `cost_per_call_usd` | number | per-agent profile constant |
| `cost-today-usd` | `cost_today_usd` | number | `calls_24h * cost_per_call_usd` |
| `cost-7d-usd` | `cost_7d_usd` | number | rough 7-day extrapolation |
| `hourly` | `hourly` | longtext | JSON array of 48 `{hour, calls, errors}` buckets |

## Traces (`kelly-agent-observability-traces-v1`)

One row per mock trace (an ordered tool-call chain for one agent), capped to
fit under the 100-record read limit — 8 agents × 10 traces/agent = 80 rows by
default (`scripts/generate_fleet_data.mjs --traces-per-agent`). Written only
by the trusted generator script.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `trace-id` | `trace_id` | text | stable domain id, required, e.g. `booking-assistant-trace-0001` |
| `agent-id` | `agent_id` | text | required, owning agent |
| `started-at` | `started_at` | text | ISO timestamp |
| `duration-ms` | `duration_ms` | number | sum of step durations up to the break (if any) |
| `status` | `status` | text | `ok\|error` |
| `cost-usd` | `cost_usd` | number | sum of `gateway.llm_call` step costs |
| `broke-at-step-id` | `broke_at_step_id` | text | set only when `status = error`; matches the last step's `step_id` |
| `steps` | `steps` | longtext | JSON array of `{step_id, name, duration_ms, status, detail?}`, in order |

## Handoffs (`kelly-agent-observability-handoffs-v1`)

Append-only human-in-the-loop log. The only Base the AirApp itself ever
writes to — always a brand-new row (`bases.createChangeRequest`), never an
update to an agent/trace record.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `handoff-id` | `handoff_id` | text | `crypto.randomUUID()`, required |
| `target-type` | `target_type` | text | `agent\|trace` |
| `target-id` | `target_id` | text | the agent's or trace's own id |
| `agent-id` | `agent_id` | text | owning agent (same as `target-id` when `target-type = agent`) |
| `status` | `status` | text | `acknowledged\|needs_investigation` |
| `note` | `note` | longtext | free text, truncated to 2000 chars |
| `created-at` | `created_at` | text | ISO timestamp |
| `created-by` | `created_by` | text | defaults to `"operator"` |

From a standalone local preview the write merges immediately (trusted
operator); from the deployed AirApp it creates a pending ChangeRequest for
the trusted process to merge, per the AirApp boundary.

## Settings (`kelly-agent-observability-settings-v1`)

One row per `kind`, looked up by `record-id`:

| `record-id` | `kind` | `payload` (JSON) |
| --- | --- | --- |
| `fleet_meta` | `fleet_meta` | `{schema_version, generated_at, seed, traces_per_agent}` |

If no `fleet_meta` row exists yet, the dashboard still renders — it just
shows an empty fleet until the seed script runs.

## Regenerating the mock fleet

```bash
node scripts/generate_fleet_data.mjs --apply
```

Without `--apply` this is a dry run that only prints what would be written.
`generateFleetData()` (`app/app/js/fleet-model.js`) is deterministic for a
given `{now, seed, tracesPerAgent}` — the same inputs always produce
bit-identical output. Re-running with the same `--seed` (default `7`) but a
new `--now` produces a fresh 48h window without changing the overall shape of
the fleet; a different `--seed` changes the fleet entirely. Never touches the
`handoffs` Base and never resets an existing handoff.
