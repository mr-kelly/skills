---
name: kelly-trade-compliance
description: Screen cross-border transactions against OFAC sanctions, BIS Entity Lists, and EAR export license rules.
metadata:
  category: legal
  tags:
    - risk:gated-write
    - surface:busabase
---

# Export Control & Sanctions Screening Desk

Operate and manage export control & sanctions screening desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
