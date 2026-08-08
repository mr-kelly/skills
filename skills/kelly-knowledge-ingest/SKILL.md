---
name: kelly-knowledge-ingest
description: Process unstructured enterprise documents, perform chunking optimization, and maintain vector search indexes.
metadata:
  category: platform
  tags:
    - risk:local-write
    - surface:busabase
---

# Enterprise Knowledge RAG Ingestion Desk

Operate and manage enterprise knowledge rag ingestion desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
