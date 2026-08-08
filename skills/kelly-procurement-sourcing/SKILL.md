---
name: kelly-procurement-sourcing
description: Manage vendor sourcing, bid comparisons, purchase order approvals, and compliance verification.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
---

# Strategic Procurement & PO Approval Console

Operate and manage strategic procurement & po approval console operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
