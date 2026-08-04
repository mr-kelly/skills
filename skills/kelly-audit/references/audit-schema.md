# Kelly Audit Schema

Use this schema when reading or writing Kelly Audit's Busabase Bases. Field
slugs are kebab-case in Busabase and normalized to snake_case in app code
(`app/app/js/providers/busabase-provider.js`, `app/app/js/audit-model.js`).
Links (order → invoice → payment), statuses, receivable aging, and every
metric are computed client-side from the stored rows on every read
(`deriveSnapshot`/`buildSnapshot`) — they are never stored, so the desk is
always fresh regardless of when a browser session loads it relative to the
last import/checks run.

Anomaly rules: `missing_invoice`, `amount_mismatch`, `overdue_receivable`, `duplicate`, `unmatched_payment`, `irregular_entry`.

Workflow statuses (anomalies): `needs_review`, `changes_requested`, `approved`, `done`, `blocked`.

Decision actions: `approve`, `request_changes`, `revise`, `block`, `dismiss`.

Proposed/execution operations: `chase_receivable`, `reissue_invoice`, `flag_to_accountant`.

## Orders (`kelly-audit-orders-v1`)

Normalized sales orders imported from CSV/JSON exports.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `order-id` | `order_id` | text | stable id, slug of `order_no`, required |
| `order-no` | `order_no` | text | natural key for upsert |
| `customer` | `customer` | text | |
| `order-date` | `order_date` | text | `YYYY-MM-DD` |
| `amount` | `amount` | number | |
| `currency` | `currency` | text | ISO code |
| `source-file` | `source_file` | text | basename of the imported file |

Derived client-side (never stored): `invoice_ids`, `payment_ids`,
`anomaly_ids`, `invoice_status` (`invoiced\|missing\|mismatch`),
`payment_status` (`paid\|partial\|unpaid`).

## Invoices (`kelly-audit-invoices-v1`)

Normalized invoices and credit notes.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `invoice-id` | `invoice_id` | text | stable id, slug of `invoice_no`, required |
| `invoice-no` | `invoice_no` | text | natural key for upsert |
| `order-no` | `order_no` | text | empty for a credit note with no original order |
| `customer` | `customer` | text | |
| `issue-date` | `issue_date` | text | `YYYY-MM-DD` |
| `due-date` | `due_date` | text | `YYYY-MM-DD`, empty for a credit note |
| `amount` | `amount` | number | negative for a credit note |
| `currency` | `currency` | text | ISO code |
| `kind` | `kind` | text | `invoice\|credit_note` |
| `notes` | `notes` | longtext | |
| `source-file` | `source_file` | text | basename of the imported file |

Credit notes carry a negative `amount` or `kind: "credit_note"` and are
excluded from receivable/aging totals. Derived client-side: `order_id`,
`payment_ids`, `anomaly_ids`, `paid_amount`, `outstanding`, `days_overdue`,
`status` (`open\|partial\|paid\|overdue\|credit_note`).

## Payments (`kelly-audit-payments-v1`)

Normalized payments / receipts (回款).

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `payment-id` | `payment_id` | text | stable id, slug of `payment_ref`, required |
| `payment-ref` | `payment_ref` | text | natural key for upsert |
| `invoice-no` | `invoice_no` | text | empty if the payment carries no invoice reference |
| `order-no` | `order_no` | text | optional direct order reference |
| `payer` | `payer` | text | |
| `paid-date` | `paid_date` | text | `YYYY-MM-DD` |
| `amount` | `amount` | number | negative for a refund/reversal |
| `currency` | `currency` | text | ISO code |
| `method` | `method` | text | `wire\|ach\|check\|bank_transfer\|alipay\|other` |
| `source-file` | `source_file` | text | basename of the imported file |

Derived client-side: `invoice_id`, `order_id`, `match_status` (`matched\|unmatched`).

## Anomalies (`kelly-audit-anomalies-v1`)

The review queue. Stable id `anom-<rule>-<primary key>` so
`scripts/run_checks.mjs` re-runs upsert instead of duplicating. Decision and
execution live on the same row — there is no separate decisions or
execution-report bucket.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `anomaly-id` | `anomaly_id` | text | stable rule-derived id, required |
| `ref` | `ref` | number | stable display ref, e.g. `Anomaly #1` |
| `rule` | `rule` | text | see rule list above |
| `severity` | `severity` | text | `low\|medium\|high` |
| `status` | `status` | text | workflow status, see list above |
| `title` | `title` | text | |
| `customer` | `customer` | text | |
| `amount-at-stake` | `amount_at_stake` | number | |
| `currency` | `currency` | text | ISO code |
| `aging-bucket` | `aging_bucket` | text | `overdue_receivable` only, e.g. `61-90` |
| `reason` | `reason` | longtext | why the rule fired, with the exact numbers |
| `evidence` | `evidence` | longtext | JSON `{order_id, invoice_id, payment_ids[], rows[], computed}` |
| `proposed-action` | `proposed_action` | text | see operation list above |
| `draft` | `draft` | longtext | editable agent draft (chasing email / internal request); the user's saved edit lives here directly |
| `agent-notes` | `agent_notes` | longtext | optional context from the agent |
| `created-at` | `created_at` | text | ISO timestamp |
| `resolved-at` | `resolved_at` | text | ISO timestamp, set on auto-resolve |
| `decision-action` | `decision_action` | text | last decision action, see list above |
| `decision-note` | `decision_note` | longtext | user note |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent\|executed\|blocked\|error` |
| `execution-operation` | `execution_operation` | text | see operation list above |
| `execution-target` | `execution_target` | text | invoice/order/payment id |
| `execution-detail` | `execution_detail` | longtext | what happened |
| `executed-at` | `executed_at` | text | ISO timestamp |

### Rule set (deterministic, from the Settings row's `rules`)

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
- `changes_requested`: the agent must revise the anomaly's `draft`, then a human returns the item to `needs_review` via a fresh decision.
- `approved`: ready for `scripts/execute_decisions.mjs` and the agent.
- `done`: dismissed, or auto-resolved (condition cleared on a `run_checks.mjs` re-run). `execute_decisions.mjs` never sets this itself — the real follow-up happening outside the app is what resolves the anomaly.
- `blocked`: cannot proceed without new information (e.g. a missing contract).

## Import Log (`kelly-audit-import-log-v1`)

Append-only history of import runs, written by `scripts/import_tables.mjs`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `log-id` | `log_id` | text | e.g. `imp-202607010902`, required |
| `imported-at` | `imported_at` | text | ISO timestamp |
| `files` | `files` | longtext | JSON `{orders, invoices, payments}` basenames |
| `added` | `added` | longtext | JSON `{orders, invoices, payments}` counts |
| `updated` | `updated` | longtext | JSON `{orders, invoices, payments}` counts |
| `warnings` | `warnings` | longtext | JSON array of short strings (skipped rows, unmatched references) |

## Settings (`kelly-audit-settings-v1`)

One row (`record-id: "config"`) with company profile, tolerance rules, and
import column mappings.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `company-name` | `company_name` | text | |
| `contact-email` | `contact_email` | text | |
| `base-currency` | `base_currency` | text | default `USD` |
| `fx-rates` | `fx_rates` | longtext | JSON map of non-base currency → base-currency rate, for metric aggregation only |
| `days-to-invoice` | `days_to_invoice` | number | default 14 |
| `amount-tolerance-pct` | `amount_tolerance_pct` | number | default 1 |
| `aging-buckets` | `aging_buckets` | longtext | JSON array, default `[30, 60, 90]` |
| `duplicate-window-days` | `duplicate_window_days` | number | default 7 |
| `import-orders-columns` | `import_orders_columns` | longtext | JSON map, canonical field → export header |
| `import-invoices-columns` | `import_invoices_columns` | longtext | JSON map, canonical field → export header |
| `import-payments-columns` | `import_payments_columns` | longtext | JSON map, canonical field → export header |

`fx_rates` maps non-base currencies to the base currency for metric
aggregation only; per-row amounts always stay in their original currency.
