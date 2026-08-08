---
name: kelly-hr-onboarding
description: Manage employee onboarding checklists, equipment dispatch, orientation milestones, and system access.
metadata:
  category: comms
  tags:
    - risk:gated-write
    - surface:busabase
---

# HR Employee Onboarding & Provisioning Desk

Operate and manage hr employee onboarding & provisioning desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
