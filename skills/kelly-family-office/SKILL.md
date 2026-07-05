---
name: kelly-family-office
license: MIT
description: Family office App-in-Skill that consolidates multi-entity investment holdings into one read-only dashboard. Use when the user invokes $kelly-family-office or /kelly-family-office, wants a consolidated family office view, multi-entity aggregation across an individual, trust, company, fund, or foundation, total AUM in a base currency, asset allocation by asset class, by entity/member, or by custodian/institution, multi-currency FX consolidation, CSV import of holdings, manual holdings entry, unrealized P/L, or read-only portfolio monitoring. It never moves money or trades.
---

# Kelly Family Office

## Overview

Use this skill as Kelly's local family-office aggregation desk. It consolidates the holdings of multiple entities and members — an individual, a family trust, an offshore company, a fund, a foundation — into one file-backed App-in-Skill dashboard: total AUM in a base currency, unrealized P/L, and allocation by entity, asset class, and institution. Data comes from CSV import and manual holdings entry; there is no live brokerage API in v1.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, check onboarding/config, refresh or load the local holdings snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

## Boundary

- The skill may read holdings CSV exports, normalize them, validate schemas, and write local snapshot files.
- The app reads and writes local files only. It must NOT connect to any brokerage/custody API, move money, place trades, rebalance, transfer, or mutate any remote system. This is a read-only monitoring dashboard.
- Treat all holdings and account data as sensitive. Do not commit `config.local.json`, env files, `app/.data/`, raw CSV exports, statements, or account identifiers.
- There is no approval lifecycle and no decisions file — this is monitoring only.

## First Run And Onboarding

On invocation, check `app/.data/onboarding.json` and private config readiness. If onboarding is absent/incomplete, guide setup before importing real holdings.

Set up in this order:

1. Define entities (`entity_id`, `name`, `type` one of INDIVIDUAL/TRUST/COMPANY/FUND/FOUNDATION, `member`).
2. Define institutions and the `base_currency`.
3. Set `fx_rates` for every non-base currency you hold (value in base currency; base = 1).
4. Import a holdings CSV or maintain holdings manually, then start the app.

Private config priority:

1. `KELLY_FAMILY_OFFICE_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-family-office/config.local.json`
3. `~/.config/kelly-family-office/config.json`
4. `skills/kelly-family-office/config.example.json` as template only

Env priority:

1. Existing environment variables
2. `KELLY_FAMILY_OFFICE_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skills/kelly-family-office/.env.local`
5. `~/.config/kelly-family-office/.env`

Ask only for non-secret setup details: entity names/types, members, institutions, base currency, and FX rates. When setup is complete and the user confirms, write `app/.data/onboarding.json`:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "1"
}
```

## CSV Format

Import holdings with `scripts/import_csv.mjs`. The documented template is `references/holdings-csv-template.csv`. Columns:

- `entity_id`, `entity_name`, `entity_type` (INDIVIDUAL|TRUST|COMPANY|FUND|FOUNDATION), `member`
- `account_id`, `institution`, `account_type`, `account_currency`
- `holding_id`, `symbol`, `name`, `asset_class` (EQUITY|BOND|CASH|CRYPTO|REAL_ESTATE|PRIVATE_EQUITY|ALTERNATIVE)
- `quantity`, `cost_basis`, `market_value` (totals in the holding `currency`), `currency`, `as_of`

Run:

```bash
node scripts/import_csv.mjs path/to/holdings.csv
```

It normalizes rows into `app/.data/snapshot.json`, converts each holding to the base currency via config `fx_rates`, computes the `totals` and the `by_entity` / `by_asset_class` / `by_institution` rollups, and writes `app/.data/import_report.json`. Manual entry is the same file — maintain the CSV (or a holdings JSON matching `references/portfolio-schema.md`) and re-run the importer.

## Demo Mode

- `?demo=1` (or `?demo=overview`) opens a deterministic offline family office: 3 entities (individual, trust, offshore company), 6 accounts across Interactive Brokers, HSBC, UBS, and Coinbase Custody, and ~16 multi-currency holdings (USD/HKD/CNY) consolidated to a USD base.
- `?demo=entities`, `?demo=assets`, `?demo=institutions`, `?demo=performance`, and `?demo=detail` select named scenes.
- `lang=en` or `lang=zh` forces UI chrome language for screenshots.
- Demo API responses never read or write live data or local private holdings files.

## Data Provider Seam

The Hono app reaches storage only through the logic modules, so the same `app.fetch` deploys to Cloudflare Workers once the data layer moves to a cloud provider. Select the backend with `KELLY_FAMILY_OFFICE_DATA_PROVIDER=local` (default `local`).

## Local App

Start the dashboard with:

```bash
skills/kelly-family-office/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring port `3000` through `4000`, or `KELLY_FAMILY_OFFICE_UI_PORT` when set. UI language supports English and Chinese chrome with an `Auto` default.

## Views

- `#/overview`: consolidated total AUM (base ccy), unrealized P/L, entity count, and a headline allocation donut.
- `#/entities`: entity/member sidebar; `#/entities/<entity_id>` drills into that entity's accounts, holdings, and subtotal.
- `#/assets`: asset-class allocation donut + bars + table with weights.
- `#/institutions`: consolidated by custodian/institution.
- `#/performance`: cost vs market value and unrealized P/L (absolute + %), per entity and total.
- `#/settings`: sanitized setup summary (base currency, FX rates, entities, institutions, data provider, onboarding state, config path). Never expose secrets.

## File Contract

Read `references/portfolio-schema.md` before editing the app, scripts, or any generated snapshot JSON.

Primary local files:

- `app/.data/snapshot.json`: canonical dashboard snapshot generated by the importer/scripts.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/import_report.json`: latest CSV import result.
- `config.local.json`: private entities/institutions/FX config, ignored by git.

Use `node scripts/validate_ui_schema.mjs app/.data/snapshot.json` before relying on a snapshot in the UI. It checks entity/account/holding references, enum values, that `aum_base` equals the sum of holdings' base market values, and that each rollup's weights sum to ~100%. The app shows an empty "Needs holdings import" state when no snapshot exists.

## Safety Defaults

- Never connect to a live brokerage/custody API, trade, transfer, or rebalance. This skill only reads local files and renders them.
- Keep raw statements and exports outside git; store only normalized safe fields in the snapshot.
- If a holding is unpriced or a currency is missing an FX rate, mark it with a warning rather than inventing a value.
- Keep FX rates explicit and dated; stale rates should surface as a warning, not silent drift.
