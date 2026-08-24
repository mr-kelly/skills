# Kelly Invest (Webull)

Kelly Invest (Webull) is a Busabase Cloud App-in-Skill dashboard that
aggregates Webull brokerage holdings — accounts, positions, cash/margin,
market value, unrealized P/L, day change, and buying power — into one
read-only portfolio view. It never places, modifies, or cancels orders and
never moves money.

## What It Shows

- Overview: total market value, total unrealized P/L, day change, cash, an
  allocation-by-asset-type donut, top day movers, and read-only insights.
- Positions: sortable holdings table across symbol, asset type, quantity,
  average cost, last price, market value, unrealized P/L, and weight.
- Accounts: cash and margin accounts with net liquidation, cash, and buying
  power; drill into an account's filtered positions.
- Position detail: single-symbol view with cost basis, market value,
  unrealized P/L, day change, weight, and holding account.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Invest overview"></td>
    <td width="50%"><img src="assets/screenshots/positions.webp" alt="Kelly Invest positions"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Portfolio command desk with market value, unrealized P/L, day change, cash, an allocation-by-asset-type donut, and top day movers.</td>
    <td><strong>Positions</strong><br>Sortable holdings table across symbol, asset type, quantity, average cost, last price, market value, unrealized P/L, and portfolio weight.</td>
  </tr>
</table>

## Demo Mode

Run the app locally and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-invest-webull/content/kelly-invest-webull-app dev
```

Then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=positions&lang=en#/positions
/?demo=accounts&lang=en#/accounts
/?demo=detail&lang=en#/positions/AAPL
```

Demo mode never reads or writes Busabase.

## Busabase Resources

Three Bases under one application Folder (`kelly-invest-webull`): `accounts`,
`positions`, and `settings`. The AirApp is read-only — it only reads these
Bases. See `SKILL.md` and `references/portfolio-schema.md` for exact field
shapes.

## Webull Sync

The only writer is the trusted skill-root script:

```bash
BUSABASE_BASE_URL=... BUSABASE_API_KEY=... BUSABASE_SPACE_ID=... \
  node scripts/sync_webull.mjs
```

It reads Webull App Key / App Secret from env vars named in local config,
fetches live holdings via the official `webull-openapi-python-sdk` (through
`scripts/webull_bridge.py`, since Webull has no first-party Node SDK), maps
them with the field-mapping logic ported verbatim from the retired
`lib/data-provider/webull.ts` into `content/kelly-invest-webull-app/app/js/webull-model.js`, and upserts
Accounts/Positions/Settings rows via Busabase ChangeRequests. Pass
`--fixture path/to/raw.json` for a credential-free dry run against a local
JSON payload shaped like `{ "accounts": [...], "positions": [...] }`.
