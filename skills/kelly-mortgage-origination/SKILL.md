---
name: kelly-mortgage-origination
description: Audit residential mortgage loan packages, borrower LTV ratios, DTI debt-to-income limits, title insurance, and closing disclosures.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
---

# Mortgage Origination & Title Audit Desk

Operate and manage mortgage origination & title audit desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
