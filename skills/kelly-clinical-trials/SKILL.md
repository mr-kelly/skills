---
name: kelly-clinical-trials
description: Track clinical trial milestone progression, subject recruitment velocity, protocol deviation rates, and IRB safety compliance.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Clinical Trial Protocol & Subject Desk

Operate and manage clinical trial protocol & subject desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
