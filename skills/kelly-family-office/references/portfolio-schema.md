# Kelly Family Office Schema

Use this schema when reading or writing Kelly Family Office's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`content/kelly-family-office-app/app/js/providers/busabase-provider.js`,
`content/kelly-family-office-app/app/js/office-model.js`, `scripts/import_csv.mjs`). The consolidated
snapshot (totals, by_entity, by_asset_class, by_institution, insights) is
computed client-side from `entities`/`accounts`/`holdings`/`settings` on
every read — it is never stored. Every consolidated figure is in the
snapshot's `base_currency`, converted from each holding's native currency
using `fx_rates`. This is a read-only monitoring dashboard: it never moves
money, trades, or connects to a live brokerage/custody API.

Entity type union: `INDIVIDUAL` · `TRUST` · `COMPANY` · `FUND` · `FOUNDATION`.
Asset class union: `EQUITY` · `BOND` · `CASH` · `CRYPTO` · `REAL_ESTATE` ·
`PRIVATE_EQUITY` · `ALTERNATIVE`.

## Entities (`kelly-family-office-entities`)

The individuals, trusts, companies, funds, and foundations being consolidated.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `entity-id` | `entity_id` | text | stable domain id, required |
| `name` | `name` | text | |
| `type` | `type` | text | `INDIVIDUAL\|TRUST\|COMPANY\|FUND\|FOUNDATION` |
| `member` | `member` | text | owner or family member, optional |

## Accounts (`kelly-family-office-accounts`)

Custodian/institution accounts held by each entity. There is no separate
Institutions Base — an institution is just a field on an account, and the
`by_institution` rollup groups holdings by `accounts.institution`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `account-id` | `account_id` | text | stable domain id, required |
| `entity-id` | `entity_id` | text | references an Entities row |
| `institution` | `institution` | text | e.g. `Interactive Brokers`, `HSBC`, `UBS`, `Coinbase Custody` |
| `account-type` | `account_type` | text | e.g. `Brokerage`, `Investment`, `Wealth Management`, `Crypto Custody` |
| `currency` | `currency` | text | account's native currency |
| `display-name` | `display_name` | text | optional label |
| `as-of` | `as_of` | text | ISO timestamp or date, optional |

## Holdings (`kelly-family-office-holdings`)

Individual holdings across every account.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `holding-id` | `holding_id` | text | stable domain id, required |
| `entity-id` | `entity_id` | text | owning entity id |
| `account-id` | `account_id` | text | custodian account id |
| `symbol` | `symbol` | text | e.g. `AAPL`, `BTC` |
| `name` | `name` | text | e.g. `Apple Inc` |
| `asset-class` | `asset_class` | text | `EQUITY\|BOND\|CASH\|CRYPTO\|REAL_ESTATE\|PRIVATE_EQUITY\|ALTERNATIVE` |
| `quantity` | `quantity` | number | |
| `cost-basis` | `cost_basis` | number | total (not per-unit) in the holding `currency` |
| `market-value` | `market_value` | number | total (not per-unit) in the holding `currency` |
| `currency` | `currency` | text | holding's native currency |
| `as-of` | `as_of` | text | ISO timestamp or date, optional |

`market_value_base`, `cost_basis_base`, and `unrealized_pnl_base` are derived
client-side via `fx_rates` on every read — they are never stored.
`unrealized_pnl_base = market_value_base - cost_basis_base`. If a holding's
currency has no configured `fx_rates` entry, it is valued at a 1:1 fallback
rate and a warning is surfaced rather than an invented rate.

## Settings (`kelly-family-office-settings`)

One row per `kind`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | required, e.g. `office-meta`, `onboarding` |
| `kind` | `kind` | text | required |
| `name` | `name` | text | optional label |
| `payload` | `payload` | longtext | JSON, non-secret |
| `updated-at` | `updated_at` | text | ISO timestamp |

`office-meta` payload: `{ base_currency, fx_rates, target_allocation }`.
`fx_rates` maps a currency code to its value in the base currency (base
currency = 1); every native amount is multiplied by its `fx_rates[currency]`
to produce the `_base` fields. `target_allocation` maps an asset class to its
target weight percentage (used by the `allocation_drift` insight; defaults
to `{ EQUITY: 45, BOND: 20, REAL_ESTATE: 15, PRIVATE_EQUITY: 8, CRYPTO: 5,
CASH: 5, ALTERNATIVE: 2 }` when absent).
`onboarding` payload: `{ completed, completed_at, config_version }`.

## Rollups

Three aggregation dimensions, computed client-side and each summing to
~100% of `totals.aum_base`:

```json
// by_entity
{ "entity_id": "id", "name": "label", "aum_base": 0, "weight_pct": 0, "unrealized_pnl_base": 0 }

// by_asset_class
{ "asset_class": "EQUITY", "aum_base": 0, "weight_pct": 0 }

// by_institution
{ "institution": "HSBC", "aum_base": 0, "weight_pct": 0 }
```

## Totals

```json
{
  "aum_base": 0,
  "cost_basis_base": 0,
  "unrealized_pnl_base": 0,
  "unrealized_pnl_pct": 0
}
```

`aum_base` MUST equal the sum of every holding's `market_value_base` (within
rounding). `cost_basis_base` MUST equal the sum of every holding's
`cost_basis_base`. `unrealized_pnl_pct = unrealized_pnl_base / cost_basis_base * 100`.

## Insights

Structured, read-only observations — `{ id, code, severity, category, params }`.
The frontend renders localized text from `code` + `params`; no sentences are
baked into the snapshot. Codes: `asset_class_concentration`,
`institution_concentration`, `entity_concentration`, `allocation_drift`,
`currency_exposure`, `cash_level`. This is a monitoring dashboard: it never
moves money, trades, or connects to a live brokerage/custody API.
