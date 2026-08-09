---
name: kelly-procurement-rfq
description: Distribute vendor RFQs, compare commercial bids, evaluate landed cost savings, and execute contract award approvals.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
---

# Strategic Sourcing RFQ Bidding & Award Desk

Operate and manage strategic sourcing rfq bidding & award desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
