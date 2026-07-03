# Kelly DevOps Ops Schema

Use this schema for `app/.data/ops_snapshot.json`. Keep the shape stable so the local app, scripts, and future providers can evolve independently. Validate with `scripts/validate_ui_schema.mjs` before relying on a snapshot.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-devops",
  "currency": "USD",
  "checks": {
    "services_checked_at": "ISO timestamp or empty",
    "domains_checked_at": "ISO timestamp or empty",
    "spend_ingested_at": "ISO timestamp or empty"
  },
  "metrics": {
    "services_total": 0,
    "services_up": 0,
    "services_degraded": 0,
    "services_down": 0,
    "certs_ok": 0,
    "certs_expiring": 0,
    "domains_ok": 0,
    "domains_expiring": 0,
    "expiring_14d": 0,
    "actions_needing_review": 0,
    "spend_mtd": 0,
    "spend_last_month": 0,
    "spend_anomalies": 0
  },
  "services": [],
  "expiries": [],
  "spend": { "currency": "USD", "providers": [], "products": [] },
  "actions": [],
  "events": [],
  "warnings": []
}
```

## Service

```json
{
  "service_id": "stable local id",
  "name": "FormKit API",
  "product": "FormKit",
  "url": "https://api.formkit.example/health",
  "status": "up|degraded|down|unknown",
  "latency_ms": 121,
  "uptime_7d": 99.98,
  "ssl": {
    "issuer": "Let's Encrypt R11",
    "valid_to": "ISO timestamp",
    "days_left": 63
  },
  "last_check_at": "ISO timestamp",
  "history": [
    {
      "at": "ISO timestamp",
      "status": "up|degraded|down",
      "latency_ms": 118,
      "http_status": 200
    }
  ],
  "meta": {
    "http_status": 200,
    "server": "optional server header",
    "note": "optional"
  },
  "warnings": ["optional short strings"]
}
```

Status rules used by `check_services.mjs`: 2xx/3xx within the latency threshold is `up`; a response slower than `thresholds.degraded_latency_ms` or a 4xx is `degraded`; a 5xx or network/timeout failure is `down`. `ssl` may be null for plain-HTTP endpoints or when the TLS probe fails. Cap `history` at the most recent 30 checks.

## Expiry

```json
{
  "expiry_id": "stable local id",
  "type": "domain|ssl_cert|api_key_rotation|plan_renewal",
  "item": "formkit.example or RELAYAPI_SENDGRID_KEY",
  "product": "product name",
  "expires_on": "YYYY-MM-DD",
  "days_left": 9,
  "auto_renew": false,
  "action_id": "optional linked action id",
  "source": "rdap|tls|config|manual",
  "registrar": "optional registrar name",
  "detail": "renewal guidance for the detail view"
}
```

`days_left` may be negative for overdue key rotations. UI severity: `< 7` days is critical (red), `< 30` days is warning (amber). Domain rows come from `sync_domains.mjs` (RDAP), cert rows from `check_services.mjs` (TLS), key-rotation and plan rows from private config.

## Spend

```json
{
  "currency": "USD",
  "providers": [
    {
      "provider_id": "gcp",
      "name": "Google Cloud",
      "currency": "USD",
      "mtd": 812.4,
      "last_month": 501.42,
      "delta_pct": 62,
      "anomaly": true,
      "action_id": "optional linked action id",
      "note": "optional short explanation"
    }
  ],
  "products": [
    {
      "product_id": "relayapi",
      "product": "RelayAPI",
      "currency": "USD",
      "mtd": 1244.48,
      "last_month": 987.87,
      "share_pct": 58
    }
  ]
}
```

`ingest_spend.mjs` flags `anomaly: true` when `mtd > last_month * (1 + thresholds.spend_anomaly_pct / 100)` and last month is non-zero.

## Action

```json
{
  "action_id": "stable local id",
  "ref": 1,
  "type": "renew_domain|rotate_key|investigate_spend|restart_service|ack_incident",
  "title": "Renew formkit.example before July 11",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "reason": "why the agent proposed this action",
  "evidence": ["short factual lines backing the proposal"],
  "plan": ["concrete ordered steps the agent will take"],
  "target": {
    "kind": "domain|api_key|spend|service|incident",
    "id": "formkit.example",
    "registrar": "optional, for renew_domain",
    "provider": "optional, for rotate_key / investigate_spend"
  },
  "note": "editable user note",
  "created_at": "ISO timestamp",
  "decision": {
    "verdict": "approve|request_changes|block|note",
    "note": "user note",
    "decided_at": "ISO timestamp"
  }
}
```

`ref` is a stable per-snapshot integer so chat can say "approve Action #2". Workflow states follow the App-in-Skill review model: `needs_review` waits on a human verdict; `request_changes` moves the item to `changes_requested` and enqueues an agent task; `approve` marks it `approved` (eligible for `execute_decisions.mjs`); `block` parks it; the agent marks it `done` after executing.

## Event

```json
{
  "event_id": "stable local id",
  "at": "ISO timestamp",
  "severity": "info|warning|error",
  "kind": "incident|check|expiry|spend|action",
  "message": "short human-readable message",
  "service_id": "optional related service id"
}
```

Keep the feed newest-first and cap it at ~50 entries.

## Warning

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "service_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

## Handoff Files

- `app/.data/ops_snapshot.json`: canonical snapshot (this schema).
- `app/.data/decisions.json`: `{ "decisions": { "<action_id>": { "action_id", "verdict", "note", "decided_at" } }, "updated_at" }`.
- `app/.data/agent_tasks.json`: `{ "tasks": [ { "task_id", "action_id", "type", "title", "request", "status", "created_at" } ], "updated_at" }` — queued by `request_changes` verdicts.
- `app/.data/execution_report.json`: `{ "generated_at", "dry_run", "entries": [ { "action_id", "ref", "operation", "target", "status", "note", "planned_at" } ] }`.
- `app/.data/onboarding.json`: `{ "completed", "completed_at", "config_version" }`.
- `app/.data/agent.lock`: `{ "owner", "message", "started_at" }` — scripts refuse to write and the app rejects decisions while it exists.
