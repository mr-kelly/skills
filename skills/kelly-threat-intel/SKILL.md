---
name: kelly-threat-intel
description: Aggregate threat intelligence feeds, Indicator of Compromise (IOC) hashes, and APT actor attribution.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Cyber Threat Intelligence & IOC Radar

Operate and manage cyber threat intelligence & ioc radar operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
