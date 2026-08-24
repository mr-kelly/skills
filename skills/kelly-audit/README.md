# Kelly Audit

Kelly Audit is a Busabase App-in-Skill finance anomaly review desk: import orders, invoices, and payments/receipts (回款) from CSV/JSON exports, let deterministic rules plus the agent flag anomalies, and review them in a queue that produces auditable decisions and follow-up actions. `scripts/import_tables.mjs` writes normalized rows from local exports, `scripts/run_checks.mjs` runs the deterministic anomaly rules, and `scripts/execute_decisions.mjs` prints the plan for approved anomalies — the AirApp itself never reads a local file or performs the real follow-up.

## What It Shows

- Overview: human-attention panel (decisions needed, amount at stake, overdue receivables), KPI cards (orders/invoices/payments imported, matched %, open anomalies, receivable outstanding), a receivable aging bar (30/60/90+), and the recent import log.
- Orders: normalized orders with invoice/payment status badges and linked anomalies; detail shows the order → invoice → payment document chain.
- Invoices: issue/due dates, amount vs paid, days overdue, status; detail shows matched payments and deltas.
- Anomalies: the review queue — rule and severity badges, evidence rows with the computed delta, an editable agent draft (e.g. a receivable-chasing email), review notes, and approve / request changes / block / dismiss decisions with stable refs like `Anomaly #1`.
- Settings: sanitized company profile, tolerance rules, and import column mappings, read live off the Settings Base.

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

## Demo Mode

Start the local preview and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-audit/content/kelly-audit-app dev
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=orders&lang=en#/orders
/?demo=invoices&lang=en#/invoices
/?demo=anomalies&lang=en#/anomalies
/?demo=detail&lang=en#/anomalies/anom-amount_mismatch-so-2026-1002
/?demo=anomalies&lang=zh#/anomalies
```

With `lang=zh` the demo content itself is localized (customer names like 明华贸易, anomaly titles, drafted chasing emails in Chinese). Demo mode never reads or writes Busabase and never persists decisions.

## Import And Checks

`scripts/import_tables.mjs` accepts CSV (header row, quoted fields supported) or JSON arrays for any subset of the three tables, and upserts them into Busabase by natural key so re-imports never duplicate rows:

```bash
node skills/kelly-audit/scripts/import_tables.mjs \
  --orders orders.csv --invoices invoices.csv --payments payments.csv --apply
```

Column mappings and tolerance rules (`days_to_invoice`, `amount_tolerance_pct`, `aging_buckets`, `duplicate_window_days`) live on the Settings Base row. Canonical fields: orders `order_no, customer, order_date, amount, currency`; invoices `invoice_no, order_no, customer, issue_date, due_date, amount, currency, kind`; payments `payment_ref, invoice_no, order_no, payer, paid_date, amount, currency, method`.

Then run `node skills/kelly-audit/scripts/run_checks.mjs --apply` to refresh the anomaly queue (stable ids; re-runs upsert and auto-resolve cleared anomalies), and `node skills/kelly-audit/scripts/execute_decisions.mjs --apply` for the follow-up execution plan of approved items — it writes an execution marker onto each anomaly with no external side effects. All three scripts are dry runs by default.

## Boundary

Imports are local files only: the trusted scripts read CSV/JSON exports the user provides and write normalized rows to Busabase; they never fetch business documents from remote systems on their own. The AirApp itself only reads and writes Busabase records — it never sends emails, changes ERP/bookkeeping records, moves money, or mutates remote systems. Any outbound follow-up (a receivable-chasing email, a message to the accountant, a billing task) is approval-required through the anomaly queue and executed by the agent outside the app via other skills (e.g. kelly-email), with the real result recorded back onto the anomaly. See `references/audit-schema.md` for the full Busabase field schema.
