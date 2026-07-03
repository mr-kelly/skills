# Kelly Audit Snapshot Schema

Use this schema for `app/.data/audit_snapshot.json`. Keep the shape stable so the local app, the deterministic scripts, and future data providers can evolve independently. Validate with `scripts/validate_ui_schema.mjs` before relying on a snapshot.

## Snapshot

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-audit",
  "base_currency": "USD",
  "fx_rates": { "CNY": 0.14 },
  "company": { "name": "Example Trading Co." },
  "range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "metrics": {},
  "orders": [],
  "invoices": [],
  "payments": [],
  "matches": [],
  "anomalies": [],
  "import_log": [],
  "warnings": []
}
```

`fx_rates` maps non-base currencies to the base currency for metric aggregation only; per-row amounts always stay in their original currency.

## Metrics

```json
{
  "order_count": 0,
  "invoice_count": 0,
  "payment_count": 0,
  "matched_payment_count": 0,
  "matched_pct": 0,
  "anomaly_count": 0,
  "open_anomaly_count": 0,
  "at_stake_total": 0,
  "receivable_total": 0,
  "overdue_receivable_total": 0,
  "aging": [
    { "bucket": "current", "amount": 0 },
    { "bucket": "1-30", "amount": 0 },
    { "bucket": "31-60", "amount": 0 },
    { "bucket": "61-90", "amount": 0 },
    { "bucket": "90+", "amount": 0 }
  ]
}
```

- `matched_pct`: matched payments / all payments, 0-1.
- `open_anomaly_count`: anomalies in `needs_review` or `changes_requested`.
- `at_stake_total`: sum of `amount_at_stake` (in base currency) over anomalies in `needs_review`, `changes_requested`, or `approved`.
- `aging`: outstanding non-credit invoice amounts (base currency) bucketed by `days_overdue` using the configured `aging_buckets` edges (default 30/60/90).

## Order

```json
{
  "order_id": "so-2026-1001",
  "order_no": "SO-2026-1001",
  "customer": "Harborline Retail",
  "order_date": "YYYY-MM-DD",
  "amount": 18400,
  "currency": "USD",
  "invoice_status": "invoiced|missing|mismatch",
  "payment_status": "paid|partial|unpaid",
  "invoice_ids": [],
  "payment_ids": [],
  "anomaly_ids": [],
  "source_file": "orders.csv"
}
```

`order_id` is the slug of `order_no` (stable across re-imports). `invoice_status`, `payment_status`, and the link arrays are derived — never hand-edit them; re-run `scripts/run_checks.mjs`.

## Invoice

```json
{
  "invoice_id": "inv-2026-041",
  "invoice_no": "INV-2026-041",
  "order_no": "SO-2026-1001",
  "order_id": "so-2026-1001",
  "customer": "Harborline Retail",
  "issue_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "amount": 18400,
  "paid_amount": 0,
  "outstanding": 18400,
  "days_overdue": 62,
  "currency": "USD",
  "kind": "invoice|credit_note",
  "status": "open|partial|paid|overdue|credit_note",
  "payment_ids": [],
  "anomaly_ids": [],
  "notes": "",
  "source_file": "invoices.csv"
}
```

Credit notes carry negative `amount` or `kind: "credit_note"` and are excluded from receivable/aging totals. `paid_amount`, `outstanding`, `days_overdue`, `status`, and links are derived.

## Payment (回款)

```json
{
  "payment_id": "rcp-5531",
  "payment_ref": "RCP-5531",
  "invoice_no": "INV-2026-043",
  "invoice_id": "inv-2026-043",
  "order_no": "",
  "order_id": "so-2026-1003",
  "payer": "Cedar & Lane Distribution",
  "paid_date": "YYYY-MM-DD",
  "amount": 4250,
  "currency": "USD",
  "method": "wire|ach|check|bank_transfer|alipay|other",
  "match_status": "matched|unmatched",
  "source_file": "payments.csv"
}
```

## Match

Derived join rows written by `deriveSnapshot` for every payment matched to an invoice:

```json
{
  "match_id": "match-rcp-5531",
  "order_id": "so-2026-1003",
  "invoice_id": "inv-2026-043",
  "payment_id": "rcp-5531",
  "rule": "invoice_no",
  "amount_delta": 0
}
```

## Anomaly

The review-queue item. Stable id `anom-<rule>-<primary key>` so `scripts/run_checks.mjs` re-runs upsert instead of duplicating.

```json
{
  "id": "anom-overdue_receivable-inv-2026-041",
  "ref": 1,
  "rule": "missing_invoice|amount_mismatch|overdue_receivable|duplicate|unmatched_payment|irregular_entry",
  "severity": "low|medium|high",
  "status": "needs_review|changes_requested|approved|done|blocked",
  "title": "Harborline Retail invoice 62 days past due",
  "customer": "Harborline Retail",
  "amount_at_stake": 18400,
  "currency": "USD",
  "aging_bucket": "61-90",
  "reason": "why the rule fired, with the exact numbers",
  "evidence": {
    "order_id": "so-2026-1001",
    "invoice_id": "inv-2026-041",
    "payment_ids": [],
    "rows": [
      { "label": "Order SO-2026-1001", "detail": "Harborline Retail · 2026-04-02", "amount": 18400, "currency": "USD" }
    ],
    "computed": "Outstanding US$18,400.00 · 62 days past due."
  },
  "proposed_action": "chase_receivable|reissue_invoice|flag_to_accountant",
  "draft": "editable agent draft: chasing email or internal request",
  "agent_notes": "optional context from the agent",
  "created_at": "ISO timestamp",
  "resolved_at": "ISO timestamp (set on auto-resolve)",
  "decision": {
    "action": "approve|request_changes|revise|block|dismiss",
    "note": "user note",
    "draft": "user-edited draft or null",
    "decided_at": "ISO timestamp"
  },
  "execution": {
    "status": "planned|ready_for_agent|executed|blocked|error",
    "operation": "chase_receivable|reissue_invoice|flag_to_accountant",
    "target": "invoice/order/payment id",
    "detail": "what happened",
    "executed_at": "ISO timestamp"
  }
}
```

### Rule set (deterministic, from config `rules`)

| Rule | Fires when | Stable id key | Default action |
| --- | --- | --- | --- |
| `missing_invoice` | order has no invoice after `days_to_invoice` days | order_id | `reissue_invoice` |
| `amount_mismatch` | linked invoice total differs from order amount beyond `amount_tolerance_pct` | order_id | `reissue_invoice` |
| `overdue_receivable` | invoice unpaid/partial past `due_date`, bucketed by `aging_buckets` (30/60/90+) | invoice_id | `chase_receivable` |
| `duplicate` | same invoice+amount paid twice within `duplicate_window_days`, or duplicate invoice number | payment_id / invoice_id | `flag_to_accountant` |
| `unmatched_payment` | payment references no importable invoice | payment_id | `flag_to_accountant` |
| `irregular_entry` | credit note without a linked original, or negative payment | invoice_id / payment_id | `flag_to_accountant` |

### Workflow states

- `needs_review`: the human must approve, request changes, block, or dismiss.
- `changes_requested`: the agent must revise (queued in `agent_tasks.json`), then return the item to `needs_review`.
- `approved`: ready for `scripts/execute_decisions.mjs` and the agent.
- `done`: executed, dismissed, or auto-resolved (condition cleared on a re-run).
- `blocked`: cannot proceed without new information (e.g. a missing contract).

## Import log entry

```json
{
  "import_id": "imp-202607010902",
  "imported_at": "ISO timestamp",
  "files": { "orders": "orders.csv", "invoices": "invoices.csv", "payments": "payments.csv" },
  "added": { "orders": 0, "invoices": 0, "payments": 0 },
  "updated": { "orders": 0, "invoices": 0, "payments": 0 },
  "warnings": ["skipped rows, unmatched references"]
}
```

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

## Sibling handoff files

- `app/.data/decisions.json`: `{ "updated_at": "...", "decisions": { "<anomaly id>": { "action", "note", "draft", "decided_at" } } }`
- `app/.data/agent_tasks.json`: `{ "updated_at": "...", "tasks": [{ "id", "ref", "title", "rule", "type": "revise_anomaly", "note", "requested_at" }] }`
- `app/.data/execution_report.json`: `{ "generated_at", "dry_run", "source", "results": [{ "id", "ref", "title", "rule", "operation", "target", "customer", "amount_at_stake", "currency", "draft", "status", "detail" }] }`
- `app/.data/onboarding.json`: `{ "completed": true, "completed_at": "...", "config_version": "1" }`
- `app/.data/agent.lock`: `{ "owner": "kelly-audit", "message": "...", "started_at": "..." }` — the app answers decision POSTs with HTTP 423 while it exists.
