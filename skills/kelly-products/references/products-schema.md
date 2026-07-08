# Kelly Products Schema

Read this before editing the app, scripts, or generated JSON for `kelly-products`.

## Files

- `app/.data/products_snapshot.json`: canonical local UI snapshot.
- `app/.data/decisions.json`: human verdicts keyed by review item id.
- `app/.data/agent_tasks.json`: queued agent work from request-changes/revise actions.
- `app/.data/execution_report.json`: sync/export/publish-handoff operations.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: write lock; the review API returns HTTP 423 while present.

## Snapshot Shape

```json
{
  "schema_version": "1",
  "generated_at": "ISO timestamp",
  "source": "kelly-products",
  "seller": { "brand": "Nimbus Home", "entity": "...", "base_currency": "USD" },
  "metrics": {
    "product_count": 0,
    "active_count": 0,
    "needs_review_count": 0,
    "low_stock_count": 0,
    "channel_issue_count": 0,
    "avg_margin_pct": 0,
    "inventory_value": 0
  },
  "products": [],
  "channel_matrix": [],
  "inventory": [],
  "review_items": [],
  "activity_log": [],
  "warnings": []
}
```

## Product

Each product must have stable ids:

```json
{
  "product_id": "prod-aurora-lamp",
  "ref": 1,
  "sku": "NH-AL-01",
  "name": "Aurora Gradient Desk Lamp",
  "subtitle": "USB-C aluminum lamp...",
  "category": "Home Office Lighting",
  "lifecycle": "launch",
  "status": "needs_review",
  "image": "/assets/product-images/aurora-lamp.png",
  "gallery": ["/assets/product-images/aurora-lamp.png"],
  "tags": ["new launch"],
  "owner": "Mia",
  "vendor": "Dongguan Lumenworks",
  "launch_date": "2026-07-18",
  "pricing": {
    "cogs": 11.8,
    "landed_cost": 15.25,
    "target_price": 39.99,
    "current_price": 38.99,
    "map_price": 34.99,
    "gross_margin_pct": 51.4,
    "breakeven_acos": 34.2
  },
  "inventory": {
    "on_hand": 920,
    "available": 712,
    "reserved": 134,
    "inbound": 1800,
    "days_cover": 16,
    "reorder_point": 900,
    "reorder_qty": 2200
  },
  "content": {
    "hero_images_ready": 5,
    "hero_images_required": 6,
    "video_ready": false,
    "listing_source": "kelly-listing",
    "copy_status": "ready"
  },
  "compliance": {
    "score": 86,
    "status": "warn",
    "notes": ["EU energy-label image missing."]
  }
}
```

## Review Items

Review items are human gates. Use `approve`, `request_changes`, or `block`; never publish or alter a marketplace channel without an approval record.

```json
{
  "item_id": "review-aurora-launch",
  "ref": 1,
  "product_id": "prod-aurora-lamp",
  "type": "publish_approval",
  "status": "needs_review",
  "title": "Approve Aurora Lamp Amazon launch",
  "summary": "Publish Amazon US...",
  "risk": "medium",
  "recommendation": "approve",
  "evidence": ["Gross margin 51.4%, above floor."],
  "created_at": "ISO timestamp"
}
```

## Invariants

- Keep `product_id`, `sku`, `item_id`, and listing ids stable across re-runs.
- Treat external marketplace publishing, price changes, SKU archival, and quality holds as approval-required.
- Product images referenced by demo/docs must live under `assets/product-images/` or `assets/screenshots/`; do not depend on external image URLs.
- Do not commit real seller exports, credentials, `config.local.json`, `.env*`, `app/.data/`, or `exports/`.
