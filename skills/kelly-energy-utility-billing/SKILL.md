---
name: kelly-energy-utility-billing
description: Audit commercial electricity/gas smart meter readings, peak-demand tariffs, and energy efficiency rebates.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Utility Smart Meter & Tariff Audit Desk

Operate and manage utility smart meter & tariff audit desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
