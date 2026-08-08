---
name: kelly-inventory-reorder
description: Monitor inventory velocity, lead times, safety stock limits, and automate purchase order drafting.
metadata:
  category: ecommerce
  tags:
    - risk:gated-write
    - surface:busabase
---

# Supply Chain Inventory & Reorder Desk

Operate and manage supply chain inventory & reorder desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
