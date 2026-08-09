---
name: kelly-relocation-mobility
description: Track expatriate employee relocations, work permit/visa expiration dates, and tax equalization policies.
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
---

# Global Mobility & Visa Compliance Desk

Operate and manage global mobility & visa compliance desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
