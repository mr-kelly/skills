---
name: kelly-bom-governance
description: Manage multi-level engineering BOMs, component substitutions, single-source risks, and Engineering Change Orders (ECO).
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Manufacturing Bill of Materials (BOM) Desk

Operate and manage manufacturing bill of materials (bom) desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
