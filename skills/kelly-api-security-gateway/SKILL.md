---
name: kelly-api-security-gateway
description: Inspect API gateway traffic for OWASP API vulnerabilities, rate limit breaches, and credential stuffing.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# API Security & Schema Violation Monitor

Operate and manage api security & schema violation monitor operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
