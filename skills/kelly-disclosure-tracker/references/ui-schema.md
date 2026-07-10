# Batch Schema — Cross-Entity Disclosure Tracker

This is a **workspace/review-queue hybrid** App-in-Skill: the human reviews and
checks off a standardized disclosure package per financing vehicle (fund/SPV),
across three generic entity roles. There is no filing capability; the tracker
only assembles, reviews, and reconciles local disclosure metadata.

## Roles

- `origination` — the onshore origination entity that originates/services the
  underlying assets.
- `fund_manager` — the offshore fund-manager entity that manages the vehicle.
- `listing_venue` — the exchange/listing venue where the vehicle's notes/units
  are listed.

## `app/.data/current_batch.json`

```json
{
  "batch_id": "disclosure-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "kelly-disclosure-tracker",
  "mode": "app-in-skill",
  "metrics": {
    "vehicles_ready": 0,
    "vehicles_blocked": 0,
    "vehicles_in_progress": 0,
    "items_needs_review": 0,
    "items_changes_requested": 0,
    "items_done": 0,
    "items_blocked": 0
  },
  "vehicles": [
    {
      "vehicle_id": "veh-01",
      "name": "SPV Alpha 12",
      "vehicle_type": "fund|spv",
      "origination_entity": "Onshore Originator A",
      "fund_manager_entity": "Offshore Manager I",
      "listing_venue": "Exchange One",
      "base_currency": "USD",
      "target_close_date": "2026-09-30",
      "metrics": { "total": 6, "needs_review": 2, "changes_requested": 1, "done": 2, "blocked": 1 },
      "readiness": "ready|blocked|in_progress"
    }
  ],
  "items": [
    {
      "id": "veh-01-aum_statement",
      "vehicle_id": "veh-01",
      "role": "origination|fund_manager|listing_venue",
      "item_key": "aum_statement",
      "title": "human-readable title",
      "summary": "short summary",
      "body": "trimmed source content for review",
      "category": "origination|fund_manager|listing_venue",
      "status": "needs_review|changes_requested|done|blocked",
      "proposed_action": "collect_document|reconcile_figures|confirm_filing|no_action",
      "reason": "why this item needs attention",
      "reconciliation": {
        "field": "aum_usd_millions",
        "origination_value": "string as recorded by the origination side",
        "listing_value": "string as filed with the listing venue",
        "match": false,
        "note": "why they don't reconcile"
      },
      "decision": {
        "action": "verified|needs_source|flagged",
        "comment": "reviewer note",
        "decided_at": "ISO timestamp"
      }
    }
  ]
}
```

## `app/.data/decisions.json`

Keyed by item id: `{ "<item_id>": { "action": "...", "comment": "...", "decided_at": "..." } }`.
The server derives each item's `status` from the decision on read
(`applyDecisions` in `app/server/store.ts`):

- `verified` → `done`
- `needs_source` → `changes_requested` (waiting on a document from the
  counterparty entity — a revision loop, not a rejection)
- `flagged` → `blocked` (a real cross-entity inconsistency that must be
  escalated before the package can be considered complete)
- no decision yet → `needs_review`

## `app/.data/execution_report.json`

Written by `scripts/execute_decisions.ts`. Records which items are settled
(`written`) vs still awaiting a human decision (`skipped`). There is no
external side effect — "execution" here only means writing the local report.

## Vehicle readiness

- `ready` — every item for the vehicle is `done`.
- `blocked` — at least one item is `blocked` (flagged inconsistency).
- `in_progress` — otherwise.

Run `scripts/validate_ui_schema.ts app/.data/current_batch.json` before relying
on a batch in the UI.
