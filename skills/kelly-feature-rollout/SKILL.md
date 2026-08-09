---
name: kelly-feature-rollout
description: Manage progressive feature flag rollouts, automated error-rate canary rollbacks, and targeting rules.
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:busabase
---

# Feature Flag Canary & Guardrail Control Desk

Operate and manage feature flag canary & guardrail control desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
