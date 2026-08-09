---
name: kelly-revops-commission
description: Calculate sales rep quota attainment, tiered commission payouts, split credit, and territory quota assignments.
metadata:
  category: sales-crm
  tags:
    - risk:gated-write
    - surface:busabase
---

# Sales Commission & Territory Plan Desk

Operate and manage sales commission & territory plan desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
