---
name: kelly-event-marketing
description: Track field marketing event sponsorships, attendee badge scans, VIP dinner invites, and pipeline ROI.
metadata:
  category: marketing
  tags:
    - risk:local-write
    - surface:busabase
---

# Summit Event Marketing & Badge Scan Desk

Operate and manage summit event marketing & badge scan desk operations via Busabase-backed workflow desk.

## Ownership Boundary

- Product UI and domain workflow logic are encapsulated inside `app/`.
- Persistent data, state transitions, and audit records belong to Busabase.
