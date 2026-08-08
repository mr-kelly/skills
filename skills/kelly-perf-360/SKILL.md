---
name: kelly-perf-360
description: Distribute OKR/KPI review forms, collect peer 360 feedback, and consolidate performance evaluations.
metadata:
  category: comms
  tags:
    - risk:gated-write
    - surface:busabase
---

# Performance Review & 360 Feedback Collector

Operate and manage performance review & 360 feedback collector operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
