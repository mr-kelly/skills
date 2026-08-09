---
name: kelly-microservice-registry
description: Maintain microservice ownership catalogs, API dependencies, tier-1 service SLOs, and drift alerts.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Microservice Service Catalog & Graph Desk

Operate and manage microservice service catalog & graph desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
