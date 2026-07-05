# Kelly Family Office Portfolio Schema

Use this schema for `app/.data/snapshot.json`. Keep the shape stable so the local app, scripts, and future connectors can evolve independently. All consolidated figures are in the snapshot `base_currency`, converted from each holding's native currency using `fx_rates`.

## Snapshot

```json
{
  "schema_version": "1",
  "snapshot_id": "stable id for this snapshot",
  "generated_at": "ISO timestamp",
  "source": "kelly-family-office",
  "base_currency": "USD",
  "fx_rates": { "USD": 1, "HKD": 0.128, "CNY": 0.139 },
  "entities": [],
  "accounts": [],
  "holdings": [],
  "totals": {
    "aum_base": 0,
    "cost_basis_base": 0,
    "unrealized_pnl_base": 0,
    "unrealized_pnl_pct": 0
  },
  "by_entity": [],
  "by_asset_class": [],
  "by_institution": [],
  "warnings": []
}
```

`fx_rates` maps a currency code to its value in the base currency (base currency = 1). Every native amount is multiplied by its `fx_rates[currency]` to produce the `_base` fields.

## Entity

```json
{
  "entity_id": "stable local id",
  "name": "Chan Family Trust",
  "type": "INDIVIDUAL|TRUST|COMPANY|FUND|FOUNDATION",
  "member": "owner or family member"
}
```

## Account

```json
{
  "account_id": "stable local id",
  "entity_id": "owning entity id",
  "institution": "Interactive Brokers|HSBC|UBS|...",
  "account_type": "Brokerage|Investment|Wealth Management|Crypto Custody|...",
  "currency": "USD",
  "display_name": "optional label",
  "as_of": "ISO timestamp or date"
}
```

## Holding

```json
{
  "holding_id": "stable local id",
  "entity_id": "owning entity id",
  "account_id": "custodian account id",
  "symbol": "AAPL",
  "name": "Apple Inc",
  "asset_class": "EQUITY|BOND|CASH|CRYPTO|REAL_ESTATE|PRIVATE_EQUITY|ALTERNATIVE",
  "quantity": 0,
  "cost_basis": 0,
  "market_value": 0,
  "currency": "USD",
  "market_value_base": 0,
  "cost_basis_base": 0,
  "unrealized_pnl_base": 0,
  "as_of": "ISO timestamp or date"
}
```

`cost_basis` and `market_value` are totals (not per-unit) in the holding `currency`. The `_base` fields are derived by the importer/generator via `fx_rates`; do not hand-edit them out of sync. `unrealized_pnl_base = market_value_base - cost_basis_base`.

## Totals

```json
{
  "aum_base": 0,
  "cost_basis_base": 0,
  "unrealized_pnl_base": 0,
  "unrealized_pnl_pct": 0
}
```

`aum_base` MUST equal the sum of every holding's `market_value_base` (within rounding). `cost_basis_base` MUST equal the sum of every holding's `cost_basis_base`. `unrealized_pnl_pct = unrealized_pnl_base / cost_basis_base * 100`.

## Rollups

Three aggregation dimensions, each summing to ~100% of `aum_base`:

```json
// by_entity
{ "entity_id": "id", "name": "label", "aum_base": 0, "weight_pct": 0, "unrealized_pnl_base": 0 }

// by_asset_class
{ "asset_class": "EQUITY", "aum_base": 0, "weight_pct": 0 }

// by_institution
{ "institution": "HSBC", "aum_base": 0, "weight_pct": 0 }
```

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "entity_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

Use warnings for stale FX rates, concentration above target, missing cost basis, or unpriced holdings. This is a monitoring dashboard: it never moves money, trades, or connects to a live brokerage in v1.
