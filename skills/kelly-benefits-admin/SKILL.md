---
name: kelly-benefits-admin
description: Manage employee health insurance selections, 401(k) matching, and annual open enrollment eligibility.
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
---

# Employee Benefits & Open Enrollment Desk

Operate and manage employee benefits & open enrollment desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
