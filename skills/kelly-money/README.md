# Kelly Money

Kelly Money is a Busabase-backed App-in-Skill dashboard for aggregating Mercury, Stripe, Airwallex, and Creem into one money ledger.

## What It Shows

- Overview: account health, recent money movement, inflow, outflow, fees, and net.
- Ledger: normalized transactions across providers and accounts.
- Accounts: provider account inventory with balances and sync status.
- Account detail: per-account transactions, provider ids, pending balance, and warnings.
- Invoices: invoice-to-transaction matching, missing invoices, amount mismatches, and review notes.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Money overview"></td>
    <td width="50%"><img src="assets/screenshots/ledger.webp" alt="Kelly Money total ledger"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Money command desk with account health, recent movement, and top-level inflow, outflow, fees, and net totals.</td>
    <td><strong>Total ledger</strong><br>Normalized cashflow table across providers, accounts, transaction types, fees, statuses, and signed net movement.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/accounts.webp" alt="Kelly Money accounts"></td>
    <td width="50%"><img src="assets/screenshots/invoices.webp" alt="Kelly Money invoice matching"></td>
  </tr>
  <tr>
    <td><strong>Accounts</strong><br>Provider account inventory with balances, currency, sync status, inflow, fees, and net movement per account.</td>
    <td><strong>Invoice matching</strong><br>Invoice-to-transaction reconciliation with matched items, missing invoices, amount mismatches, and review status.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/detail.webp" alt="Kelly Money invoice exception detail"></td>
  </tr>
  <tr>
    <td><strong>Exception detail</strong><br>Invoice exception view with amount/date deltas, matching rule, explicit tolerance, candidate transaction, and audit trail.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-money-app install
pnpm --dir content/kelly-money-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see mock data without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=ledger&lang=en#/ledger
/?demo=accounts&lang=en#/accounts
/?demo=invoices&lang=en#/invoices
/?demo=detail&lang=en#/accounts/stripe-main
```

Demo mode never reads or writes Busabase.

## Data

All state — accounts, transactions, invoices, invoice matches, and
configured-account settings — lives in five Busabase Bases under one
application Folder. The app is entirely read-only: it displays whatever the
trusted skill process has synced or imported into these same Bases; it never
writes from the browser. See `SKILL.md` and `references/ledger-schema.md`
for the resource map.
