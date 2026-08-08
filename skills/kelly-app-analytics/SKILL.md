---
name: kelly-app-analytics
description: Track product feature adoption, funnel conversion drop-offs, user retention cohorts, and feature usage.
metadata:
  category: growth
  tags:
    - risk:local-write
    - surface:busabase
---

# App Product Analytics & Journey Desk

Operate and manage app product analytics & journey desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
