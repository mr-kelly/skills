---
name: kelly-patent-radar
description: Analyze patent filings, track competitor IP activity, and evaluate Freedom-to-Operate (FTO) risks.
metadata:
  category: legal
  tags:
    - risk:local-write
    - surface:busabase
---

# IP Patent Landscape & FTO Freedom Desk

Operate and manage ip patent landscape & fto freedom desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
