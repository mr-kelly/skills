---
name: kelly-customer-cdp-segment
description: Build behavioral customer segments, RFM loyalty tiers, and sync activation lists to ad channels.
metadata:
  category: growth
  tags:
    - risk:local-write
    - surface:busabase
---

# CDP Audience Segmentation & Sync Desk

Operate and manage cdp audience segmentation & sync desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
