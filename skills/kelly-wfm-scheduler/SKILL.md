---
name: kelly-wfm-scheduler
description: Optimize employee shift schedules, enforce labor compliance, track attendance, and calculate overtime.
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
---

# Workforce Management & Shift Scheduler

Operate and manage workforce management & shift scheduler operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
