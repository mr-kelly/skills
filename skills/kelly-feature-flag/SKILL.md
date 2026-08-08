---
name: kelly-feature-flag
description: Manage feature flag kill switches, progressive canary rollouts, and flag cleanup audits.
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:busabase
---

# Feature Flag Governance & Rollout Safety Desk

Operate and manage feature flag governance & rollout safety desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
