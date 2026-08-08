---
name: kelly-gdpr-privacy
description: Handle Data Subject Access Requests (DSAR), track data erasure workflows, and maintain privacy consent logs.
metadata:
  category: legal
  tags:
    - risk:local-write
    - surface:busabase
---

# GDPR / Data Privacy & DSAR Request Desk

Operate and manage gdpr / data privacy & dsar request desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
