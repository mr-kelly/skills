---
name: kelly-zero-trust-access
description: Manage zero-trust network access (ZTNA) policies, device health posture, and context-aware SSO authentication.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Zero Trust Access & Device Trust Desk

Operate and manage zero trust access & device trust desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
