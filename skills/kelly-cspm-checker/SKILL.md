---
name: kelly-cspm-checker
description: Audit cloud security groups, public storage buckets, unencrypted assets, and compliance drift.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Cloud Security Posture & CSPM Inspector

Operate and manage cloud security posture & cspm inspector operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
