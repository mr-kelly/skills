---
name: kelly-lead-enrichment
description: Enrich B2B lead profiles with firmographics, tech stack signals, employee headcount, and contact data.
metadata:
  category: sales-crm
  tags:
    - risk:local-write
    - surface:busabase
---

# Lead Enrichment & Firmographic Desk

Operate and manage lead enrichment & firmographic desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
