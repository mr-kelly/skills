---
name: kelly-data-pipeline-observability
description: Monitor Airflow/dbt data pipeline freshness, schema drift, table null rates, and upstream lineage graphs.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Data Pipeline Lineage & Quality Audit Desk

Operate and manage data pipeline lineage & quality audit desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
