---
name: kelly-nps-survey
description: Automate post-interaction CSAT and NPS surveys, aggregate feedback, and route negative reviews.
metadata:
  category: sales-crm
  tags:
    - risk:gated-write
    - surface:busabase
---

# Automated CSAT / NPS Survey & Sentiment Desk

Operate and manage automated csat / nps survey & sentiment desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
