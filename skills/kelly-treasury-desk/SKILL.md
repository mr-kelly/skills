---
name: kelly-treasury-desk
description: Consolidate multi-bank balances, monitor foreign exchange exposure, and manage short-term investments.
metadata:
  category: finance
  tags:
    - risk:local-write
    - surface:busabase
---

# Multi-Bank Treasury & FX Risk Desk

Operate and manage multi-bank treasury & fx risk desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
