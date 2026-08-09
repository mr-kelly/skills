---
name: kelly-rfp-responder
description: Search pre-approved security questionnaire answers, RFP compliance matrices, and proposal drafting.
metadata:
  category: sales-crm
  tags:
    - risk:local-write
    - surface:busabase
---

# Enterprise RFP Response Knowledge Desk

Operate and manage enterprise rfp response knowledge desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
