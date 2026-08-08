---
name: kelly-churn-predictor
description: Analyze account telemetry, usage drops, and ticket sentiment to trigger automated retention workflows.
metadata:
  category: growth
  tags:
    - risk:local-write
    - surface:busabase
---

# Customer Churn Predictor & Retention Desk

Operate and manage customer churn predictor & retention desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
