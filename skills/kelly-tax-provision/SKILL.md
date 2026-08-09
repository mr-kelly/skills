---
name: kelly-tax-provision
description: Calculate corporate income tax provisions, transfer pricing adjustments, deferred tax assets, and cross-border VAT reconciliation.
metadata:
  category: finance
  tags:
    - risk:local-write
    - surface:busabase
---

# Corporate Income Tax Provision & VAT Desk

Operate and manage corporate income tax provision & vat desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
