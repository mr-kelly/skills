---
name: kelly-reverse-logistics
description: Manage customer product returns (RMA), grading inspection, restocking, warranty fraud checks, and refurbishment workflows.
metadata:
  category: ecommerce
  tags:
    - risk:gated-write
    - surface:busabase
---

# Returns, RMA & Refurbishment Desk

Operate and manage returns, rma & refurbishment desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
