---
name: kelly-cloud-finops-advisor
description: Analyze cloud instance utilization, savings plan coverage, and automated right-sizing recommendations.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Multi-Cloud Reserved Instance Optimizer

Operate and manage multi-cloud reserved instance optimizer operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
