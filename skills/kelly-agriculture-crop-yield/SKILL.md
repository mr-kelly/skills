---
name: kelly-agriculture-crop-yield
description: Analyze farm satellite NDVI vegetation indices, soil moisture telemetry, fertilizer application, and yield projections.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# Precision Agronomy & Crop Yield Desk

Operate and manage precision agronomy & crop yield desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
