---
name: kelly-emr-compliance
description: Audit electronic medical record access logs, HL7/FHIR endpoint security, and HIPAA Privacy/Security Rule violations.
metadata:
  category: industry-intel
  tags:
    - risk:local-write
    - surface:busabase
---

# EMR Interoperability & HIPAA Audit Desk

Operate and manage emr interoperability & hipaa audit desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
