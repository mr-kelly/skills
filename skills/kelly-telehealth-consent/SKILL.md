---
name: kelly-telehealth-consent
description: Track patient digital consent forms, state medical license verification, and virtual visit compliance logs.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Telehealth Informed Consent & Provider Desk

Operate and manage telehealth informed consent & provider desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
