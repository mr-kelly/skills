---
name: kelly-secret-scanner
description: Audit repositories, config files, and logs for leaked secrets, API keys, and sensitive credentials.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Secret Scanner & Leakage Audit Desk

Operate and manage secret scanner & leakage audit desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
