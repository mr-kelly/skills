---
name: kelly-fund-accounting
description: Calculate daily hedge fund and ETF Net Asset Value (NAV), fee accruals, hurdle rates, and investor subscriptions/redemptions.
metadata:
  category: invest
  tags:
    - risk:local-write
    - surface:busabase
---

# Fund Accounting NAV & Audit Desk

Operate and manage fund accounting nav & audit desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
