---
name: kelly-iam-audit
description: Audit user accounts, excess privileges, inactive credentials, and enforce least-privilege policies.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# IAM Privilege Audit & Identity Desk

Operate and manage iam privilege audit & identity desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
