---
name: kelly-vendor-sla
description: Track vendor delivery timeliness (OTD), defect rates, contract SLAs, and generate quarterly vendor scorecards.
metadata:
  category: sales-crm
  tags:
    - risk:local-write
    - surface:busabase
---

# Supplier SLA & Quality Performance Desk

Operate and manage supplier sla & quality performance desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
