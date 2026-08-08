---
name: kelly-asset-lifecycle
description: Track physical hardware, depreciation schedules, maintenance logs, and asset retirement workflows.
metadata:
  category: finance
  tags:
    - risk:local-write
    - surface:busabase
---

# Enterprise Fixed Asset Lifecycle Console

Operate and manage enterprise fixed asset lifecycle console operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
