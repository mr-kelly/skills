---
name: kelly-ats-candidate-score
description: Aggregate interviewer evaluation scorecards, candidate competency rubrics, and hiring manager decisions.
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
---

# Candidate Interview Scorecard Evaluation

Operate and manage candidate interview scorecard evaluation operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
