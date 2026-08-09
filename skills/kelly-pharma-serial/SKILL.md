---
name: kelly-pharma-serial
description: Monitor DSCSA prescription drug serialization, 2D barcode verification, lot verification, and supply chain chain of custody.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Pharmaceutical Track & Trace Serialization Desk

Operate and manage pharmaceutical track & trace serialization desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
