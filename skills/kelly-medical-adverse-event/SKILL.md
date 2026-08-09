---
name: kelly-medical-adverse-event
description: Log post-market medical device and pharmacovigilance adverse event reports for FDA MedWatch filing.
metadata:
  category: industry-intel
  tags:
    - risk:gated-write
    - surface:busabase
---

# Medical Device & Drug Adverse Event Desk

Operate and manage medical device & drug adverse event desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
