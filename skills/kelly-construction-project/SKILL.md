---
name: kelly-construction-project
description: Manage construction project budget vs actuals, subcontractor change orders, safety OSHA logs, and draw requests.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Commercial Construction Job Costing Desk

Operate and manage commercial construction job costing desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
