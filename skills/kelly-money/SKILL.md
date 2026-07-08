---
name: kelly-money
license: MIT
description: Personal App-in-Skill money ledger for aggregating Mercury, Stripe, Airwallex, and Creem accounts into a local dashboard. Use when the user invokes $kelly-money or /kelly-money, wants a total cashflow ledger, account columns, Accounts sidebar, Account Detail views, finance onboarding, connector setup, transaction import/sync, reconciliation, balances, payouts, payments, fees, refunds, transfers, or local review of money movement across these providers.
---

# Kelly Money

## Overview

Use this skill as Kelly's local money ledger operator. It aggregates Mercury, Stripe, Airwallex, and Creem into one file-backed App-in-Skill dashboard with a total cashflow table, provider/account columns, an `Accounts` sidebar view, and account detail pages.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local ledger snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

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

## Boundary

- The skill may read provider APIs, import exports, normalize transactions, validate schemas, and write local handoff files.
- The app reads and writes local files only. It must not initiate provider API calls, move money, issue refunds, create charges, change bank settings, or mutate remote systems.
- Treat all money/account data as sensitive. Do not commit `config.local.json`, env files, `app/.data/`, exports, tokens, customer PII, or raw provider responses.
- Require explicit user approval before any remote mutation. Normal Kelly Money operation should be read-only aggregation unless the user asks for a specific approved action.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before syncing real accounts.

Private config priority:

1. `KELLY_MONEY_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-money/config.local.json`
3. `~/.config/kelly-money/config.json`
4. `skills/kelly-money/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_MONEY_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-money/.env.local`
5. `~/.config/kelly-money/.env`

Ask for non-secret setup details only: provider, display name, business/entity, currency, account grouping, and which env var names contain API keys/tokens. Never ask the user to paste secret values into chat. Secrets belong only in local env files.

When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## Local App

Start the dashboard with:

```bash
skills/kelly-money/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_MONEY_UI_PORT` when set.

Required app views:

- `#/ledger`: total cashflow table. Rows are normalized transactions; columns include date, description, provider, account, type, currency, gross, fee, net, and status.
- `#/overview`: dashboard summary with account health, totals, and recent money movement.
- `#/accounts`: Accounts sidebar/list. Each configured or imported account appears with provider, currency, balance, inflow, outflow, net, and last sync.
- `#/accounts/<account_id>`: Account Detail. Show balances, recent transactions, counterparties, statuses, provider identifiers, and sync health.
- `#/invoices`: invoice reconciliation desk. Show invoices, match status, amount deltas, missing matches, and transactions that need human review.
- `#/invoices/<invoice_id>`: Invoice Detail. Show invoice metadata, selected transaction, confidence, amount/date deltas, and notes.
- `#/settings`: sanitized setup summary. Show account names, provider types, configured env var readiness booleans, data provider name, onboarding state, and safe file paths. Never expose secret values.

Demo mode:

- `?demo=1` opens a deterministic mock ledger for documentation and screenshots.
- `?demo=overview`, `?demo=ledger`, `?demo=accounts`, and `?demo=detail` select named mock scenes.
- `?demo=invoices` opens the invoice matching mock scene.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses must never read or write live provider data or local private ledger files.

UI language: support English and Chinese chrome with `Auto` default. Keep provider names, account names, transaction descriptions, and imported data in their original language.

## File Contract

Read `references/ledger-schema.md` before editing the app, scripts, or any generated ledger JSON.

Primary local files:

- `app/.data/ledger_snapshot.json`: canonical dashboard snapshot generated by the skill/scripts.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/sync_report.json`: latest connector/import run result.
- `app/.data/agent.lock`: temporary lock while the skill is syncing or rewriting files.
- `config.local.json`: private account configuration, ignored by git.

Use `scripts/validate_ui_schema.mjs app/.data/ledger_snapshot.json` before relying on a snapshot in the UI. The app may show an empty setup state when no snapshot exists.

Invoice matching lives inside Kelly Money rather than a separate skill until it becomes a full invoice-generation or tax-export workflow. Write imported invoice metadata into `invoices[]` and matching decisions into `invoice_matches[]`; do not store private invoice PDFs in git.

## Normal Workflow

1. Detect mode. Default to App UI.
2. Load private config through the local provider/config helpers. If only `config.example.json` exists, enter onboarding.
3. If the user asks to add/change accounts, update private config or explain exact JSON/env changes. Do not write secrets.
4. If the user asks to sync, propose a read-only sync scope first: providers, accounts, date window, currencies, and whether to include pending transactions.
5. After approval, acquire `app/.data/agent.lock`, fetch or import provider data, normalize to the ledger schema, write `ledger_snapshot.json`, write `sync_report.json`, validate, and release the lock.
6. Start/reuse the UI and report the URL.
7. For discrepancies, surface them as ledger warnings and ask before any remote action.

For invoice reconciliation, match by amount/currency, signed direction, counterparty/vendor/customer names, provider references, invoice number in memo/metadata, and nearby dates. Mark uncertain cases `needs_review` instead of forcing a match. Use `amount_mismatch` for partial payments, credits, refunds, fee-vs-gross confusion, or invoice totals that do not equal transaction net/gross.

## Provider Notes

Use provider API docs or official exports when implementing sync. Provider APIs and object shapes change, so verify current official docs before writing connector code.

Normalize these concepts consistently:

- Mercury: bank accounts, transactions, counterparty, transfer ids, check/wire/ACH metadata.
- Stripe: balance transactions, charges, refunds, disputes, payouts, fees, source objects.
- Airwallex: wallet/balances, financial transactions, conversions, transfers, payouts, fees.
- Creem: payments/orders/subscriptions/refunds/fees/payout-equivalent records as available.

Always preserve provider provenance: `provider`, `provider_account_id`, `provider_transaction_id`, raw currency, original amount fields, and source object references. Deduplicate by stable provider ids before falling back to date/amount/description hashes.

## Safety Defaults

- Treat charge creation, refunds, transfers, payouts, bank-account changes, account linking, currency conversion, subscription changes, and customer-visible billing actions as approval-required.
- Prefer read-only scopes/tokens when possible.
- Redact account numbers and token-like strings in logs, reports, and UI state.
- Keep local exports minimal and use stable ids so repeated syncs are idempotent.
- If balances and transactions disagree, do not invent corrections. Mark the account `warning` and explain the mismatch.
