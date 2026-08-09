---
name: kelly-litigation-discovery
description: Manage litigation legal holds, document responsiveness coding, attorney-client privilege logs, and production sets.
metadata:
  category: legal
  tags:
    - risk:local-write
    - surface:busabase
---

# E-Discovery Document Review Desk

Operate and manage e-discovery document review desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
