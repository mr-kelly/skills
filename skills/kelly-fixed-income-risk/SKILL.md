---
name: kelly-fixed-income-risk
description: Analyze fixed income duration, Macaulay convexity, credit rating downgrades, yield curve shifts, and OAS spreads.
metadata:
  category: invest
  tags:
    - risk:local-write
    - surface:busabase
---

# Bond Portfolio Yield & Credit Analytics Desk

Operate and manage bond portfolio yield & credit analytics desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
