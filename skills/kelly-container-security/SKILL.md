---
name: kelly-container-security
description: Audit container registry image vulnerabilities, CVE severity ratings, and Kyverno policy enforcement.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Kubernetes Image Vulnerability Desk

Operate and manage kubernetes image vulnerability desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
