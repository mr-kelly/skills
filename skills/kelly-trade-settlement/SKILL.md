---
name: kelly-trade-settlement
description: Monitor equity and bond T+1 trade settlement matching, custodian clearing, and CSDR fail penalty resolution.
metadata:
  category: finance
  tags:
    - risk:local-write
    - surface:busabase
---

# Securities Trade Settlement & Fail Desk

Operate and manage securities trade settlement & fail desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
