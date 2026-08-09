---
name: kelly-med-device-maintenance
description: Manage biomedical device calibration schedules, preventive maintenance, and FDA 21 CFR Part 820 quality system logs.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Hospital Medical Device Maintenance Desk

Operate and manage hospital medical device maintenance desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
