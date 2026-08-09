---
name: kelly-identity-governance-iga
description: Manage quarterly employee access certification campaigns, SOD segregation of duties, and role revoke approvals.
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:busabase
---

# IGA Access Certification Review Desk

Operate and manage iga access certification review desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
