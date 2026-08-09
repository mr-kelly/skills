---
name: kelly-aml-compliance
description: Monitor suspicious financial transactions, PEP sanctions screening, structuring pattern detection, and SAR regulatory filings.
metadata:
  category: finance
  tags:
    - risk:gated-write
    - surface:busabase
---

# Anti-Money Laundering (AML) Monitoring Desk

Operate and manage anti-money laundering (aml) monitoring desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
