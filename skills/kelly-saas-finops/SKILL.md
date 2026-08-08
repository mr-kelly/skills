---
name: kelly-saas-finops
description: Track SaaS subscriptions, seat utilization, unused licenses, and optimize software spend.
metadata:
  category: finance
  tags:
    - risk:local-write
    - surface:busabase
---

# SaaS License & Subscription FinOps Console

Operate and manage saas license & subscription finops console operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
