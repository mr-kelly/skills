# Kelly Money

Kelly Money is a local App-in-Skill dashboard for aggregating Mercury, Stripe, Airwallex, and Creem into one money ledger.

## What It Shows

- Overview: account health, recent money movement, inflow, outflow, fees, and net.
- Ledger: normalized transactions across providers and accounts.
- Accounts: provider account inventory with balances and sync status.
- Account detail: per-account transactions, provider ids, pending balance, and warnings.
- Invoices: invoice-to-transaction matching, missing invoices, amount mismatches, and review notes.

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-money/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=ledger&lang=en#/ledger
/?demo=accounts&lang=en#/accounts
/?demo=invoices&lang=en#/invoices
/?demo=detail&lang=en#/accounts/stripe-main
```

Demo mode never reads live provider data or local private ledger files.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-money/config.json`, then put secrets in local env files only. Never commit real provider tokens, account exports, or files under `app/.data/`.
