# Kelly Invest (Webull) Portfolio Schema

Use this schema for `app/.data/snapshot.json`. Keep the shape stable so the local
app, scripts, and the Webull data-provider adapter can evolve independently. The
app is read-only: it renders this snapshot and the demo payload only. Skill-side
code (the Webull adapter) reads the brokerage and writes this normalized file.

## Snapshot

```json
{
  "schema_version": "1",
  "snapshot_id": "stable id for this snapshot run",
  "generated_at": "ISO timestamp",
  "base_currency": "USD",
  "accounts": [],
  "positions": [],
  "totals": {
    "market_value": 0,
    "cost_basis": 0,
    "unrealized_pnl": 0,
    "unrealized_pnl_pct": 0,
    "day_change": 0,
    "day_change_pct": 0,
    "total_cash": 0
  },
  "allocation": [],
  "warnings": []
}
```

`source` (e.g. `"kelly-invest-webull"`) is optional metadata and may be included.

## Account

```json
{
  "account_id": "stable local id",
  "account_type": "CASH|MARGIN",
  "display_name": "Webull Cash",
  "currency": "USD",
  "net_liquidation": 0,
  "total_cash": 0,
  "buying_power": 0
}
```

`net_liquidation` is the account value (positions market value + cash). Map from
Webull `get_account_list()` / `get_account_balance()`.

## Position

```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "asset_type": "STOCK|ETF|OPTION|CRYPTO|OTHER",
  "account_id": "stable local account id",
  "quantity": 0,
  "avg_cost": 0,
  "last_price": 0,
  "market_value": 0,
  "cost_basis": 0,
  "unrealized_pnl": 0,
  "unrealized_pnl_pct": 0,
  "day_change": 0,
  "day_change_pct": 0,
  "currency": "USD",
  "weight_pct": 0
}
```

Derived fields must stay internally consistent:

- `market_value = quantity * last_price`
- `cost_basis = quantity * avg_cost`
- `unrealized_pnl = market_value - cost_basis`
- `unrealized_pnl_pct = unrealized_pnl / cost_basis * 100`
- `day_change = quantity * (last_price - prev_close)`
- `weight_pct = market_value / totals.market_value * 100`

Map from Webull `get_account_positions()`.

## Totals

Portfolio-level aggregates over all positions plus cash:

- `market_value` = sum of position `market_value`
- `cost_basis` = sum of position `cost_basis`
- `unrealized_pnl` = `market_value - cost_basis`
- `day_change` = sum of position `day_change`
- `total_cash` = sum of account `total_cash`

## Allocation

```json
{
  "asset_type": "STOCK|ETF|OPTION|CRYPTO|OTHER",
  "market_value": 0,
  "weight_pct": 0
}
```

One entry per asset type present in positions. `weight_pct` values should sum to
~100%.

## Warnings

```json
{
  "id": "stable warning id",
  "severity": "info|warning|error",
  "account_id": "optional",
  "message": "short human-readable message",
  "detail": "optional detail"
}
```

Use warnings for missing credentials, stale syncs, rate-limit backoff, unsupported
Webull fields, or price staleness. This is a monitoring dashboard: there is no
approval lifecycle and no `decisions.json`.
