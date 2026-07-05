# Kelly Invest (Webull)

Kelly Invest (Webull) is a local, read-only App-in-Skill dashboard that aggregates
your personal Webull brokerage holdings into one portfolio view. It never places,
modifies, or cancels orders and never moves money.

## What It Shows

- Overview: total market value, unrealized P/L (with %), day change, cash, and a
  pure-CSS allocation donut by asset type.
- Positions: sortable table (symbol, name, qty, avg cost, last, market value,
  unrealized P/L %, weight).
- Accounts: cash and margin accounts with net liquidation, cash, and buying power;
  selecting an account filters positions.
- Position detail: per-symbol pane with cost basis, day change, and weight.

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-invest-webull/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=1&lang=en#/overview
/?demo=positions&lang=en#/positions
/?demo=accounts&lang=en#/accounts
/?demo=detail&lang=en#/positions/AAPL
```

Demo mode is fully offline and never reads live Webull data or local private files.

## Private Config

Copy `config.example.json` to `config.local.json` or
`~/.config/kelly-invest-webull/config.json`. Put the Webull App Key / App Secret in
local env files only, referenced by env var name in config. Never commit real
credentials, exports, or files under `app/.data/`.
