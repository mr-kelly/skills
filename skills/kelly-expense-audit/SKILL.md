---
name: kelly-expense-audit
description: Audit travel receipts, verify merchant authenticity, enforce expense policies, and flag out-of-policy claims.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
---

# Corporate Expense & Receipt Audit Console

Operate and manage corporate expense & receipt audit console operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
