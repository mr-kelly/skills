---
name: kelly-code-sast-audit
description: Audit source code repositories for SQL injection, OWASP Top 10 vulnerabilities, and insecure dependencies.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Static Application Security Testing (SAST) Desk

Operate and manage static application security testing (sast) desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
