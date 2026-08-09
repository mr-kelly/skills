---
name: kelly-product-usage-health
description: Track Product-Led Growth (PLG) feature adoption velocity, DAU/MAU ratios, and expansion trigger alerts.
metadata:
  category: growth
  tags:
    - risk:local-write
    - surface:busabase
---

# PLG Product Usage Adoption & Health Desk

Operate and manage plg product usage adoption & health desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
