---
name: kelly-patient-triage
description: Manage emergency intake triage scores (ESI 1-5), ER bed allocation, and specialist care pathway routing.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Patient Intake Triage & Care Pathway Desk

Operate and manage patient intake triage & care pathway desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
