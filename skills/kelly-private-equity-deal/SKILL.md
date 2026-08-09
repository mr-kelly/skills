---
name: kelly-private-equity-deal
description: Track private equity pipeline deals, LBO cash flow models, cap table dilution, and exit IRR / MOIC sensitivity scenarios.
metadata:
  category: invest
  tags:
    - risk:local-write
    - surface:busabase
---

# PE / VC Deal Sourcing & LBO Valuation Desk

Operate and manage pe / vc deal sourcing & lbo valuation desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
