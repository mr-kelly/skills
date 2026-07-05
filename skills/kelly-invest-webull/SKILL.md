---
name: kelly-invest-webull
license: MIT
description: Personal read-only App-in-Skill portfolio dashboard that aggregates Webull brokerage holdings into a local view. Use when the user invokes $kelly-invest-webull or /kelly-invest-webull, wants to review their Webull portfolio, holdings, positions, accounts (cash/margin), asset allocation, market value, unrealized P/L, day change, cash, or buying power. Read-only aggregation only — it never places, modifies, or cancels orders and never moves money.
---

# Kelly Invest (Webull)

## Overview

Use this skill as Kelly's local, read-only Webull portfolio operator. It aggregates
personal Webull brokerage accounts and holdings into one file-backed App-in-Skill
dashboard with an Overview (totals, unrealized P/L, day change, cash, allocation
donut), a sortable Positions table, an Accounts view (cash and margin), and a
per-symbol Position detail pane.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only
handling, check onboarding/config, refresh or load the local portfolio snapshot,
start/reuse the local app with `app/start.sh`, and give the actual local URL. Use
chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or
similar.

This is a monitoring dashboard: there is no approval lifecycle and no
`decisions.json`.

## Boundary

- Read-only aggregation only. The skill may read Webull account/balance/position
  data, normalize it, and write local handoff files.
- NEVER place, modify, or cancel orders. NEVER move money, transfer, withdraw, or
  change account settings. There is no trading path in this skill by design.
- The app reads and writes local files only. It must not call Webull or any remote
  system; it only renders the normalized snapshot and the demo payload.
- Treat all holdings/account data as sensitive. Do not commit `config.local.json`,
  env files, `app/.data/`, exports, or raw Webull responses.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If
onboarding is absent/incomplete, guide setup before syncing real holdings.

To connect Webull, the user needs a Webull OpenAPI **App Key** and **App Secret**
from Webull's OpenAPI Management/Portal (region id `us`; approval typically takes
1-2 business days). A UAT test host exists at
`us-openapi-alb.uat.webullbroker.com`.

Private config priority:

1. `KELLY_INVEST_WEBULL_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-invest-webull/config.local.json`
3. `~/.config/kelly-invest-webull/config.json`
4. `skills/kelly-invest-webull/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_INVEST_WEBULL_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-invest-webull/.env.local`
5. `~/.config/kelly-invest-webull/.env`

Ask for non-secret setup details only: region, base URL, base currency, account
allowlist, and which env var names hold the App Key / App Secret. Never ask the
user to paste secret values into chat. Secrets belong only in local env files, and
config references them by name (`app_key_env`, `app_secret_env`).

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
skills/kelly-invest-webull/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or
`KELLY_INVEST_WEBULL_UI_PORT` when set. First run installs `hono` and
`@hono/node-server`; the frontend is zero-build vanilla.

## Demo Mode

- `?demo=1` opens a deterministic, fully offline mock portfolio (~10 positions
  across STOCK/ETF/CRYPTO in one cash and one margin account) with computed P/L for
  documentation and screenshots.
- `?demo=positions`, `?demo=accounts`, and `?demo=detail` select named mock scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write live Webull data or local private files.

UI language: support English and Chinese chrome with `Auto` default. The user is
Chinese; keep symbols and provider values in their original form.

## Data Provider

The skill reads Webull; the app only ever reads the normalized snapshot.

- Provider selector env: `KELLY_INVEST_WEBULL_DATA_PROVIDER=local` (default).
  Reserve `webull` as the live provider name. Config `data_provider` mirrors this.
- Webull field-mapping lives in `lib/data-provider/webull.ts` (the adapter). It
  reads Webull via the official `webull-openapi-python-sdk`-style client
  (`get_account_list()`, `get_account_balance()`, `get_account_positions()`) and
  writes a normalized snapshot. Rate limit is ~10 requests / 30 seconds per App ID;
  batch and back off.
- Store secrets only via env; reference env var names in config
  (`app_key_env`, `app_secret_env`). Never hardcode credentials.

Read `references/portfolio-schema.md` before editing the app, scripts, or the
adapter. Primary local files:

- `app/.data/snapshot.json`: canonical normalized portfolio snapshot.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/sync_report.json`: latest sync run result.
- `app/.data/agent.lock`: temporary lock while the skill is syncing.
- `config.local.json`: private Webull configuration, ignored by git.

Use `scripts/validate_ui_schema.ts app/.data/snapshot.json` before relying on a
snapshot in the UI. `scripts/generate_demo_snapshot.ts` writes a consistent demo
snapshot to `app/.data/snapshot.json`.

## Views

- `#/overview`: total market value, total unrealized P/L (color + %), day change,
  cash, and allocation-by-asset-type donut plus top day movers.
- `#/positions`: sortable table (symbol, name, qty, avg cost, last, market value,
  unrealized P/L %, weight).
- `#/accounts`: cash and margin accounts with net liquidation, cash, buying power.
- `#/accounts/<account_id>`: account summary and its filtered positions.
- `#/positions/<symbol>`: per-symbol detail pane.
- `#/settings`: sanitized setup summary — data provider, config path, Webull region
  and base URL, credential-readiness booleans, and onboarding state. Never expose
  secret values.

## Safety

- Read-only by design. Prefer read-only Webull scopes/credentials.
- Do not invent prices or fills. If a price or balance looks stale or missing, add
  a snapshot warning instead of guessing.
- Redact credential-like strings in logs, reports, and UI state.
- Keep local exports minimal and use stable ids so repeated syncs are idempotent.
