---
name: kelly-order-fulfillment
description: Track order fulfillment across warehouses, handle delivery exceptions, and process RMA return requests.
metadata:
  category: ecommerce
  tags:
    - risk:gated-write
    - surface:busabase
---

# Omnichannel Order Fulfillment & Exception Desk

Operate and manage omnichannel order fulfillment & exception desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
