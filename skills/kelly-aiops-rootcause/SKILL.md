---
name: kelly-aiops-rootcause
description: Group system alerts, reduce notification storms, and perform automated root cause analysis during incidents.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# AIOps Incident Alert & Root Cause Analyzer

Operate and manage aiops incident alert & root cause analyzer operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
