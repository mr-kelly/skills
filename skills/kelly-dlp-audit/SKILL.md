---
name: kelly-dlp-audit
description: Inspect outgoing emails, documents, and messages for sensitive PII, PCI, or intellectual property leakage.
metadata:
  category: comms
  tags:
    - risk:local-write
    - surface:busabase
---

# Data Loss Prevention & PII Auditor

Operate and manage data loss prevention & pii auditor operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
