---
name: kelly-employee-relations
description: Track employee relations workplace investigations, policy violation reports, and confidential resolution logs.
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
---

# ER Workplace Grievance & Incident Desk

Operate and manage er workplace grievance & incident desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
