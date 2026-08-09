---
name: kelly-insurance-claims-loss
description: Inspect commercial property insurance loss claims, adjuster damage assessments, policy deductibles, and payout approvals.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
---

# Property & Casualty Loss Adjustment Desk

Operate and manage property & casualty loss adjustment desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
