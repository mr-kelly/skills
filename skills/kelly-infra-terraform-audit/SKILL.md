---
name: kelly-infra-terraform-audit
description: Inspect Terraform / OpenTofu state drift, hardcoded security group risks, and cost impact previews.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Terraform Infrastructure Drift & Security Desk

Operate and manage terraform infrastructure drift & security desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
