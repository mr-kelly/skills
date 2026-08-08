---
name: kelly-ats-screener
description: Automate resume parsing, candidate scoring, and job description match evaluation.
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
---

# ATS Resume Screener & Evaluation Desk

Operate and manage ats resume screener & evaluation desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
