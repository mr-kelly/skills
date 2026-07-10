# Agent Fleet Observability Desk — Data Schema

Use this schema for `app/.data/fleet.json`. Keep the shape stable so the app,
scripts, and generator (`lib/generate.ts`) can evolve independently. The app is
read-mostly: it renders this file and the demo payload, and only ever writes
handoff records.

## Fleet (`app/.data/fleet.json`)

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "agents": [
    { "agent_id": "booking-assistant", "name": "Booking Assistant", "description": "..." }
  ],
  "metrics": [
    {
      "agent_id": "booking-assistant",
      "status": "healthy",
      "calls_24h": 900,
      "calls_48h": 1800,
      "error_rate_pct": 1.2,
      "p50_latency_ms": 950,
      "p95_latency_ms": 2100,
      "cost_per_call_usd": 0.018,
      "cost_today_usd": 16.2,
      "cost_7d_usd": 98.4,
      "hourly": [
        { "hour": "ISO timestamp, start of hour", "calls": 40, "errors": 1 }
      ]
    }
  ],
  "traces": [
    {
      "trace_id": "booking-assistant-trace-0001",
      "agent_id": "booking-assistant",
      "started_at": "ISO timestamp",
      "duration_ms": 2400,
      "status": "error",
      "cost_usd": 0.02,
      "broke_at_step_id": "booking-assistant-t1-s3",
      "steps": [
        { "step_id": "booking-assistant-t1-s0", "name": "parse_request", "duration_ms": 120, "status": "ok" },
        { "step_id": "booking-assistant-t1-s3", "name": "gateway.llm_call", "duration_ms": 1400, "status": "error", "detail": "..." }
      ]
    }
  ]
}
```

`status` is derived from `error_rate_pct` and `p95_latency_ms` against
`config.example.json`'s `thresholds` (>= degraded/critical cutoffs).

## Handoffs (`app/.data/handoffs.jsonl`)

Append-only, one JSON object per line, written only by `POST /api/handoffs`:

```json
{
  "handoff_id": "uuid",
  "target_type": "agent | trace",
  "target_id": "agent_id or trace_id",
  "agent_id": "owning agent_id",
  "status": "acknowledged | needs_investigation",
  "note": "free text",
  "created_at": "ISO timestamp",
  "created_by": "operator"
}
```

## Regenerating mock data

```bash
node scripts/generate_fleet_data.ts
```

This overwrites `app/.data/fleet.json` deterministically for the current day
(seeded RNG), so re-running produces a fresh 48h window without losing the
overall shape of the fleet.
