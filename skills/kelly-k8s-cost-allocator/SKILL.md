---
name: kelly-k8s-cost-allocator
description: Allocate Kubernetes cluster CPU/Memory costs by namespace/team and generate right-sizing requests.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Kubernetes Pod Cost & Right-Sizing Desk

Operate and manage kubernetes pod cost & right-sizing desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
