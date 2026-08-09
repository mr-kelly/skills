---
name: kelly-pharmacy-formulary
description: Inspect hospital drug formularies, therapeutic substitutions, and drug-drug interaction safety alerts.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Hospital Pharmacy Formulary & Safety Desk

Operate and manage hospital pharmacy formulary & safety desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
