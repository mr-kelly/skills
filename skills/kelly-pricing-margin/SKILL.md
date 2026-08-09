---
name: kelly-pricing-margin
description: Analyze SKU cost elasticity, volume discount thresholds, and gross margin optimization rules.
metadata:
  category: sales-crm
  tags:
    - risk:local-write
    - surface:busabase
---

# Dynamic Product Pricing & Margin Optimizer

Operate and manage dynamic product pricing & margin optimizer operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
