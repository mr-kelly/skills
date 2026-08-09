---
name: kelly-api-contract-testing
description: Validate microservice REST/gRPC API contracts, backward compatibility, and breaking schema changes.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# OpenAPI Consumer Contract & Breaking Change Desk

Operate and manage openapi consumer contract & breaking change desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
