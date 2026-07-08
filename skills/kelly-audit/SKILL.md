---
name: kelly-audit
license: MIT
description: Personal App-in-Skill finance anomaly review desk that imports the three business tables — orders, invoices, payments/receipts (回款) — from CSV/JSON exports, flags anomalies with deterministic rules, and runs a human review queue with auditable decisions. Use when the user invokes $kelly-audit or /kelly-audit, mentions finance audit, order invoice payment reconciliation, 对账, 应收, 回款, 发票异常, receivables aging, overdue receivables, duplicate payments, missing invoices, amount mismatches, or anomaly review.
---

# Kelly Audit

## Overview

Use this skill as Kelly's finance anomaly review desk for a finance lead, small-business owner, or bookkeeping team. It imports the three business tables — orders, invoices, and payments/receipts (回款) — from local CSV/JSON exports, cross-checks them with deterministic rules plus agent judgment, and surfaces anomalies in a file-backed App-in-Skill review queue. The skill imports, normalizes, and flags; the app is where a human confirms, assigns, or dismisses each anomaly; approved items become concrete follow-up actions (chase a receivable, reissue an invoice, flag to the accountant) executed by the agent outside the app.

This is different from kelly-money, which watches Kelly's own provider accounts: kelly-audit audits imported business documents against each other.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local audit snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Audit overview"></td>
    <td width="50%"><img src="assets/screenshots/anomalies.webp" alt="Kelly Audit anomaly queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Finance audit desk with amount at risk, receivable aging bar, anomaly queue preview, and import history.</td>
    <td><strong>Anomaly queue</strong><br>Rule-flagged anomalies with the order-invoice-payment evidence chain and a drafted chasing email for approval.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/invoices.webp" alt="Kelly Audit invoices"></td>
    <td width="50%"><img src="assets/screenshots/orders.webp" alt="Kelly Audit orders"></td>
  </tr>
  <tr>
    <td><strong>Invoices</strong><br>Invoice ledger with due dates, paid amounts, days overdue, and match status.</td>
    <td><strong>Orders</strong><br>Normalized orders with invoice and payment status badges and linked anomaly indicators.</td>
  </tr>
</table>

## Boundary

- Imports are local files only: the skill reads CSV/JSON exports the user provides, normalizes them, runs checks, and writes local handoff files. It never fetches business documents from remote systems on its own.
- The app reads and writes local files only and never touches any network beyond `127.0.0.1`. It must not send emails, change ERP/bookkeeping records, move money, or mutate remote systems.
- Any outbound follow-up (a receivable-chasing email, a message to the accountant, a billing task) is approval-required through the anomaly queue and executed by the agent OUTSIDE the app via other skills (e.g. kelly-email), with the real result recorded back to `app/.data/execution_report.json`.
- Treat all order/invoice/payment data as sensitive business data. Never commit imported business data: `config.local.json`, env files, anything under `app/.data/`, sample exports with real customer names, and generated reports stay out of git.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before importing real tables.

Private config priority:

1. `KELLY_AUDIT_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-audit/config.local.json`
3. `~/.config/kelly-audit/config.json`
4. `skills/kelly-audit/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_AUDIT_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-audit/.env.local`
5. `~/.config/kelly-audit/.env`

Onboarding asks for non-secret details only:

- Company profile: name, contact email, base currency, optional `fx_rates` for mixed-currency books.
- Column mappings per table: which export header holds `order_no`, `customer`, `amount`, `invoice_no`, `due_date`, `payment_ref`, and so on (see `config.example.json`).
- Tolerance rules: `days_to_invoice`, `amount_tolerance_pct`, `aging_buckets` (default 30/60/90), `duplicate_window_days`.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the review desk with:

```bash
skills/kelly-audit/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_AUDIT_UI_PORT` when set. The launcher reuses a running Kelly Audit server only when `/api/state` proves it is the same app (`app: "kelly-audit"`); otherwise it picks the next free port.

Required app views:

- `#/overview`: audit command desk. Human-attention panel (anomalies needing a decision, high-risk amount at stake, overdue receivables total), KPI cards (orders/invoices/payments imported, matched %, open anomalies, receivable outstanding), a receivable aging buckets bar (inline SVG), and the recent import log.
- `#/orders` and `#/orders/<id>`: normalized orders table — order no, customer, date, amount, currency, invoice status badge, payment status badge, linked anomaly. Detail shows the linked invoice(s) + payment(s) chain with per-link status.
- `#/invoices` and `#/invoices/<id>`: invoices table — invoice no, order ref, customer, issue/due dates, amount, paid amount, days overdue, status. Detail shows matched payments, amount deltas, and notes.
- `#/anomalies` (and `#/anomalies/<id>` deep links): the review queue with workflow states `needs_review`, `changes_requested`, `approved`, `done`, `blocked`. Each anomaly card shows the rule badge, severity, evidence (the exact rows plus the computed delta), the agent-drafted follow-up action (e.g. a receivable-chasing email draft or an internal request), an editable draft plus a `Review note` textarea, decision buttons (approve / request changes / block / dismiss = done), and a stable reference such as `Anomaly #1`.
- `#/settings`: sanitized config only — company profile, tolerance rules, import column mappings, env readiness booleans, data provider, and onboarding state.

Demo mode:

- `?demo=1` opens a deterministic mock audit desk for documentation and screenshots.
- `?demo=overview`, `?demo=orders`, `?demo=invoices`, `?demo=anomalies`, and `?demo=detail` (an amount-mismatch anomaly with its evidence chain) select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language; with `lang=zh` the demo content itself (customer names such as 明华贸易, anomaly titles, reasons, drafted emails) is meaningfully localized for Chinese screenshots.
- Demo API responses never read or write files under `app/.data/`. Demo decisions stay in the browser only.

UI language: support English and Chinese chrome with `Auto` default (following the browser language) plus an explicit selector persisted locally. Keep imported document numbers and real business data untranslated.

## File Contract

Read `references/audit-schema.md` before editing the app, scripts, or any generated audit JSON.

Primary local files:

- `app/.data/audit_snapshot.json`: canonical snapshot — `orders[]`, `invoices[]`, `payments[]`, `anomalies[]`, `matches[]`, `metrics`, `import_log[]` — generated by the scripts.
- `app/.data/decisions.json`: user verdicts and notes keyed by anomaly id.
- `app/.data/agent_tasks.json`: queued agent work — anomalies in `changes_requested` with the user's revision note.
- `app/.data/execution_report.json`: latest execution results for approved anomalies.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill is importing, checking, or executing. The app answers `POST /api/decision` with HTTP 423 while the lock exists.
- `config.local.json`: private company/mapping/rules configuration, ignored by git.

Use `scripts/validate_ui_schema.mjs app/.data/audit_snapshot.json` before relying on a snapshot in the UI. The app may show an empty setup state when no snapshot exists.

## Import Workflow

1. Detect mode. Default to App UI.
2. Load private config. If only `config.example.json` exists, enter onboarding.
3. Ask which export files to import (orders, invoices, payments — any subset) and confirm the column mapping if the headers changed.
4. Run the write path:

```bash
node skills/kelly-audit/scripts/import_tables.mjs \
  --orders /path/orders.csv --invoices /path/invoices.csv --payments /path/payments.csv
```

The script parses CSV (quoted fields included) or JSON arrays, applies the column mapping from config, normalizes dates/amounts/currencies, upserts by natural key (`order_no` / `invoice_no` / `payment_ref`) so re-imports are idempotent, recomputes derived statuses and metrics, and appends an `import_log` entry with per-file added/updated counts and row warnings. It refuses to run while `agent.lock` exists and takes the lock while writing.

5. Surface import warnings (skipped rows, payments referencing unknown invoices) to the user instead of silently dropping them.

## Check Workflow

1. After every import (or on request), run the deterministic rule set:

```bash
node skills/kelly-audit/scripts/run_checks.mjs
```

Rules, driven by config tolerances: `missing_invoice` (order without invoice after `days_to_invoice` days), `amount_mismatch` (invoice total vs order amount beyond `amount_tolerance_pct`), `overdue_receivable` (unpaid past due date, with 30/60/90+ aging buckets), `duplicate` (duplicate payment within `duplicate_window_days`, duplicate invoice number), `unmatched_payment` (payment matching no invoice), `irregular_entry` (credit note without an original, negative payments).

2. Anomaly ids are stable (`anom-<rule>-<key>`), so re-runs upsert instead of duplicating; existing statuses, refs, decisions, and user-edited drafts are preserved; anomalies whose condition cleared are auto-resolved to `done`.
3. The agent may then improve on the deterministic output: sharpen titles/reasons, localize, and refine the drafted follow-up (chasing email, billing request, accountant note) — keeping ids and evidence intact.
4. Validate with `scripts/validate_ui_schema.mjs`, start/reuse the UI, and send the user to `#/anomalies`.

## Decisions And Agent Tasks Loop

1. The user reviews at `#/anomalies`: approve, request changes (with a note), save an edited draft, block, or dismiss. Decisions persist through `POST /api/decision` into `decisions.json` (423 while locked).
2. Poll `app/.data/agent_tasks.json` for `changes_requested` items, revise the anomaly draft per the note, and return the item to `needs_review`.
3. On explicit user request to execute, run `scripts/execute_decisions.mjs` (dry-run by default; `--apply` marks items `ready_for_agent`). It re-checks the lock and decisions and writes `execution_report.json` entries with concrete operations — `chase_receivable` (with the drafted email handoff), `reissue_invoice`, `flag_to_accountant` — and target document ids. No external side effects either way.
4. The agent then performs the approved follow-ups outside the app (send the chasing email via the email skill, open the billing/accountant task), records real results in `execution_report.json`, and executed anomalies show as `done`.

## Safety Defaults

- Treat every outbound message, ERP/bookkeeping mutation, refund, and credit-note change as approval-required via the anomaly queue.
- Store only the minimum normalized fields the review desk needs; keep raw exports outside git and reference them by path in `import_log`.
- Use stable ids and natural-key upserts so repeated imports, checks, and executions are idempotent.
- Never expose secrets or full customer datasets through `/api/state`, logs, or reports; the settings view shows env readiness booleans and column mappings only.
- If the tables disagree in a way no rule covers, add a snapshot warning and ask the user — do not invent corrections to make the books balance.
