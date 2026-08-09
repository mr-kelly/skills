---
name: kelly-incident-postmortem
description: Structure outage incident timelines, 5-Why root cause analyses, and track preventive engineering action items.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Blameless Incident Postmortem & Action Desk

Operate and manage blameless incident postmortem & action desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
