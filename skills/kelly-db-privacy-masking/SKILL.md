---
name: kelly-db-privacy-masking
description: Enforce dynamic data masking and tokenization for PII/PHI in non-production database environments.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Database Sensitive Data Masking Desk

Operate and manage database sensitive data masking desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
