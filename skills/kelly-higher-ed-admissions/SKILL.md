---
name: kelly-higher-ed-admissions
description: Manage university applicant review pipelines, financial aid scholarship scoring, and enrollment yield tracking.
metadata:
  category: education
  tags:
    - risk:local-write
    - surface:busabase
---

# University Admissions Recruitment Desk

Operate and manage university admissions recruitment desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
