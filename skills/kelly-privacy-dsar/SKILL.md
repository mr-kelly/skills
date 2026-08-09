---
name: kelly-privacy-dsar
description: Process GDPR / CCPA Data Subject Access Requests (DSAR), identity verification, and multi-system data erasure.
metadata:
  category: legal
  tags:
    - risk:gated-write
    - surface:busabase
---

# Privacy DSAR Right-to-be-Forgotten Desk

Operate and manage privacy dsar right-to-be-forgotten desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
