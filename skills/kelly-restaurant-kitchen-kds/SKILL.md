---
name: kelly-restaurant-kitchen-kds
description: Monitor Kitchen Display System (KDS) prep times, food ingredient inventory, waste ratios, and recipe margin.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Restaurant POS, KDS & Recipe Costing Desk

Operate and manage restaurant pos, kds & recipe costing desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
