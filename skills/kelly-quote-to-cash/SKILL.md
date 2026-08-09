---
name: kelly-quote-to-cash
description: Streamline enterprise deal approval routing, non-standard contract terms, multi-year discounting, and billing handoff.
metadata:
  category: sales-crm
  tags:
    - risk:gated-write
    - surface:busabase
---

# Quote-to-Cash (Q2C) Deal Approval Desk

Operate and manage quote-to-cash (q2c) deal approval desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
