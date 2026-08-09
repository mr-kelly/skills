---
name: kelly-solar-asset-monitoring
description: Monitor solar farm MW megawatt output, inverter failure telemetry, panel cleaning schedules, and PPA revenue.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Solar Photovoltaic Plant & Health Desk

Operate and manage solar photovoltaic plant & health desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
