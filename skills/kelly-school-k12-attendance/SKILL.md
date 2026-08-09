---
name: kelly-school-k12-attendance
description: Track K-12 daily student attendance, disciplinary incident logs, report card grades, and parent notifications.
metadata:
  category: education
  tags:
    - risk:local-write
    - surface:busabase
---

# K-12 Attendance, Behavior & Portal Desk

Operate and manage k-12 attendance, behavior & portal desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
