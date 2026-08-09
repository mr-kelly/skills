---
name: kelly-db-migration
description: Plan backward-compatible database migrations, dual-write strategies, and lock-free DDL execution.
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:busabase
---

# Zero-Downtime DB Schema Migration Desk

Operate and manage zero-downtime db schema migration desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
