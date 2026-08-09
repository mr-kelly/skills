---
name: kelly-credit-underwriting
description: Evaluate corporate borrower financial ratios, DSCR debt service coverage, collateral valuation, and credit limit risk limits.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
---

# Commercial Loan Underwriting Desk

Operate and manage commercial loan underwriting desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
