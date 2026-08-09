---
name: kelly-freight-tms
description: Manage international freight shipments, carrier rate quotes, bill of lading documentation, and customs duties.
metadata:
  category: ecommerce
  tags:
    - risk:gated-write
    - surface:busabase
---

# Freight Dispatch & Customs Clearance Desk

Operate and manage freight dispatch & customs clearance desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
