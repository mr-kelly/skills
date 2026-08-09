---
name: kelly-treasury-hedging
description: Manage corporate foreign exchange exposure, currency forward contracts, interest rate swaps, and VaR risk sensitivity.
metadata:
  category: finance
  tags:
    - risk:local-write
    - surface:busabase
---

# Corporate FX & Interest Rate Hedging Desk

Operate and manage corporate fx & interest rate hedging desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
