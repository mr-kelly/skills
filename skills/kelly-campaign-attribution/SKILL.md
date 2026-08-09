---
name: kelly-campaign-attribution
description: Calculate first-touch, last-touch, and W-shaped multi-touch marketing attribution models and Customer Acquisition Cost (CAC).
metadata:
  category: marketing
  tags:
    - risk:local-write
    - surface:busabase
---

# Multi-Touch Marketing Attribution Desk

Operate and manage multi-touch marketing attribution desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
