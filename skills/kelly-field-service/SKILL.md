---
name: kelly-field-service
description: Dispatch field service engineers, manage trunk inventory, track SLA arrival times, and customer sign-off.
metadata:
  category: sales-crm
  tags:
    - risk:gated-write
    - surface:busabase
---

# Field Service Technician Dispatch Console

Operate and manage field service technician dispatch console operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
