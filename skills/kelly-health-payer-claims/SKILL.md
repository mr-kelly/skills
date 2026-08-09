---
name: kelly-health-payer-claims
description: Adjudicate medical billing claims, verify ICD-10/CPT coding alignment, and flag prior authorization denials.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
---

# Health Insurance Claims Adjudication Desk

Operate and manage health insurance claims adjudication desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
