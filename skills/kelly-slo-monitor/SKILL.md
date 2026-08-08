---
name: kelly-slo-monitor
description: Track service SLOs, monitor error budget burn rates, and trigger freeze policies when budgets deplete.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Service Level Objective & Error Budget Desk

Operate and manage service level objective & error budget desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
