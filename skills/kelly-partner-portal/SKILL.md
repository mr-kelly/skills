---
name: kelly-partner-portal
description: Manage channel partner deal registrations, commission tiers, lead protection, and co-selling collateral.
metadata:
  category: sales-crm
  tags:
    - risk:gated-write
    - surface:busabase
---

# Channel Partner Portal & Deal Registration Desk

Operate and manage channel partner portal & deal registration desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
