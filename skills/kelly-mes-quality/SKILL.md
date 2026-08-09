---
name: kelly-mes-quality
description: Monitor shop floor Statistical Process Control (SPC), Cpk capability indices, yield defects, and ISO 9001 quality audits.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# MES Quality Inspection & SPC Console

Operate and manage mes quality inspection & spc console operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
