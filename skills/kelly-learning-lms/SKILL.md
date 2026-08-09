---
name: kelly-learning-lms
description: Monitor mandatory corporate compliance training completion, skill certifications, and overdue course alerts.
metadata:
  category: education
  tags:
    - risk:local-write
    - surface:busabase
---

# Compliance Training & LMS Certification Desk

Operate and manage compliance training & lms certification desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
