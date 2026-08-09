---
name: kelly-endpoint-edr
description: Monitor endpoint detection and response (EDR) malware alerts, memory injection, and host isolation commands.
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:busabase
---

# Endpoint EDR Threat Detection Desk

Operate and manage endpoint edr threat detection desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
