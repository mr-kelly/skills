---
name: kelly-lab-lims
description: Track pathology sample processing pipelines, test turnaround times (TAT), and CLIA quality control validation.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Clinical Laboratory LIMS Sample Desk

Operate and manage clinical laboratory lims sample desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
