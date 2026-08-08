---
name: kelly-quote-cpq
description: Generate multi-line product quotes, apply volume discounts, and route non-standard margin approvals.
metadata:
  category: sales-crm
  tags:
    - risk:gated-write
    - surface:busabase
---

# CPQ Quote & Discount Approval Console

Operate and manage cpq quote & discount approval console operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
