---
name: kelly-service-mesh
description: Inspect service mesh mTLS policies, traffic split ratios, latency budgets, and microservice topology.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Service Mesh Policy & Traffic Telemetry Desk

Operate and manage service mesh policy & traffic telemetry desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
