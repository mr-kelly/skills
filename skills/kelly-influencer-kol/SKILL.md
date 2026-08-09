---
name: kelly-influencer-kol
description: Manage KOL influencer campaign contracts, promo code conversions, content approvals, and ROAS.
metadata:
  category: marketing
  tags:
    - risk:local-write
    - surface:busabase
---

# Influencer Marketing & ROAS Tracking Desk

Operate and manage influencer marketing & roas tracking desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
