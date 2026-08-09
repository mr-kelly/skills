---
name: kelly-customer-feedback-voe
description: Aggregate customer feedback across support calls, NPS surveys, and product requests into prioritized roadmap epics.
metadata:
  category: sales-crm
  tags:
    - risk:local-write
    - surface:busabase
---

# Voice of Customer (VoC) Feature Router

Operate and manage voice of customer (voc) feature router operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
