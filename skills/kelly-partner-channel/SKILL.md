---
name: kelly-partner-channel
description: Manage reseller partner deal registrations, conflict checks, co-sell margin tiers, and MDF fund allocation.
metadata:
  category: sales-crm
  tags:
    - risk:gated-write
    - surface:busabase
---

# Channel Reseller Deal Registration Desk

Operate and manage channel reseller deal registration desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
