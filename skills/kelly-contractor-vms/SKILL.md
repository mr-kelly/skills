---
name: kelly-contractor-vms
description: Manage contractor staffing agency POs, billable hour approvals, and co-employment compliance.
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
---

# Contingent Workforce & VMS Vendor Desk

Operate and manage contingent workforce & vms vendor desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
