---
name: kelly-sub-processor-dpa
description: Audit third-party vendor Data Processing Agreements (DPA), Standard Contractual Clauses (SCC), and sub-processors.
metadata:
  category: legal
  tags:
    - risk:local-write
    - surface:busabase
---

# DPA & Vendor Sub-Processor Audit Desk

Operate and manage dpa & vendor sub-processor audit desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
