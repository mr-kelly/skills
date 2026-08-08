---
name: kelly-api-governance
description: Manage OpenAPI schemas, breaking change detection, rate limits, and API deprecation lifecycles.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# API Lifecycle & Schema Governance Console

Operate and manage api lifecycle & schema governance console operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
