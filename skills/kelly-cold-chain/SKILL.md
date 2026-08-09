---
name: kelly-cold-chain
description: Monitor temperature-controlled shipment IoT sensors, thermal excursions, threshold breaches, and perishable goods spoilage.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Cold Chain IoT Excursion Incident Desk

Operate and manage cold chain iot excursion incident desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
