---
name: kelly-global-payroll
description: Consolidate multi-currency payroll runs, statutory tax deductions, and employer social contribution calculations.
metadata:
  category: comms
  tags:
    - risk:gated-write
    - surface:busabase
---

# Multi-Country Global Payroll & Tax Desk

Operate and manage multi-country global payroll & tax desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
