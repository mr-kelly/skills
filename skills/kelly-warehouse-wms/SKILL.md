---
name: kelly-warehouse-wms
description: Optimize WMS warehouse bin putaway, wave picking efficiency, slotting utilization, and inventory cycle counting.
metadata:
  category: ecommerce
  tags:
    - risk:local-write
    - surface:busabase
---

# Warehouse Putaway, Picking & Cycle Count Desk

Operate and manage warehouse putaway, picking & cycle count desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
