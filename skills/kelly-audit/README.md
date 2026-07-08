# Kelly Audit

Kelly Audit is a local App-in-Skill finance anomaly review desk: import orders, invoices, and payments/receipts (回款) from CSV/JSON exports, let deterministic rules plus the agent flag anomalies, and review them in a queue that produces auditable decisions and follow-up actions.

## What It Shows

- Overview: human-attention panel (decisions needed, amount at stake, overdue receivables), KPI cards (orders/invoices/payments imported, matched %, open anomalies, receivable outstanding), a receivable aging bar (30/60/90+), and the recent import log.
- Orders: normalized orders with invoice/payment status badges and linked anomalies; detail shows the order → invoice → payment document chain.
- Invoices: issue/due dates, amount vs paid, days overdue, status; detail shows matched payments and deltas.
- Anomalies: the review queue — rule and severity badges, evidence rows with the computed delta, an editable agent draft (e.g. a receivable-chasing email), review notes, and approve / request changes / block / dismiss decisions with stable refs like `Anomaly #1`.
- Settings: sanitized company profile, tolerance rules, import column mappings, env readiness, and onboarding state.

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

Run the app and open a safe mock-data scene:

```bash
skills/kelly-audit/app/start.sh
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

With `lang=zh` the demo content itself is localized (customer names like 明华贸易, anomaly titles, drafted chasing emails in Chinese). Demo mode never reads or writes files under `app/.data/`.

## Import Format

`scripts/import_tables.ts` accepts CSV (header row, quoted fields supported) or JSON arrays for any subset of the three tables:

```bash
node skills/kelly-audit/scripts/import_tables.ts \
  --orders orders.csv --invoices invoices.csv --payments payments.csv
```

Column mappings live in config (`import.<table>.columns`, canonical → export header). Example for orders exported with Chinese-friendly headers:

```json
"orders": {
  "format": "csv",
  "columns": {
    "order_no": "OrderNo",
    "customer": "Customer",
    "order_date": "OrderDate",
    "amount": "Total",
    "currency": "Currency"
  }
}
```

Canonical fields: orders `order_no, customer, order_date, amount, currency`; invoices `invoice_no, order_no, customer, issue_date, due_date, amount, currency, kind`; payments `payment_ref, invoice_no, order_no, payer, paid_date, amount, currency, method`. Re-imports upsert by natural key, so running the same file twice never duplicates rows.

Then run `node skills/kelly-audit/scripts/run_checks.ts` to refresh the anomaly queue (stable ids; re-runs upsert and auto-resolve cleared anomalies), and `node skills/kelly-audit/scripts/execute_decisions.ts` for a dry-run execution plan of approved items.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-audit/config.json` and fill in the company profile, column mappings, and tolerance rules (`days_to_invoice`, `amount_tolerance_pct`, `aging_buckets`, `duplicate_window_days`). Never commit real exports, `config.local.json`, or anything under `app/.data/`.

## Boundary

The app reads and writes local files only and never touches any network beyond `127.0.0.1`. Imports are local files; the skill performs no remote reads on its own. Any outbound follow-up (chasing email, accountant message) is approval-required through the queue and executed by the agent outside the app via other skills, with results recorded in `app/.data/execution_report.json`.
