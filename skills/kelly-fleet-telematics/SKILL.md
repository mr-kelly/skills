---
name: kelly-fleet-telematics
description: Track commercial fleet GPS telemetry, driver safety scores, fuel efficiency, diagnostic trouble codes (DTC), and engine maintenance.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Fleet Telematics & Vehicle Maintenance Desk

Operate and manage fleet telematics & vehicle maintenance desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
