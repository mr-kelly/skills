---
name: kelly-contract-risk
description: Inspect commercial contracts for non-standard indemnity, liability caps, termination rights, and risk exposure.
metadata:
  category: legal
  tags:
    - risk:local-write
    - surface:busabase
---

# Contract Clause Risk & Indemnity Inspector

Operate and manage contract clause risk & indemnity inspector operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
