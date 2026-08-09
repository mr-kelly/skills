---
name: kelly-secops-soar
description: Automate security incident response playbooks, malicious IP quarantine, and phishing email containment.
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:busabase
---

# SOAR Security Playbook Orchestration Desk

Operate and manage soar security playbook orchestration desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
