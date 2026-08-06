# Kelly Products Schema

Use this schema when reading or writing Kelly Products's Busabase Bases.
Field slugs are kebab-case in Busabase and normalized to snake_case in app
code (`app/app/js/providers/busabase-provider.js`,
`app/app/js/products-model.js`). Metrics and the recent-activity feed are
computed client-side from the `products`/`channels`/`inventory`/`review`/
`settings` Bases on every read (`buildSnapshot`/`assembleSnapshot` in
`products-model.js`) — the only persisted state is what lives directly on
those five Bases.

Product lifecycle: `launch`, `active`, `test`, `archive`.

Product/channel status values (free text, badge-styled in the UI):
`active`, `needs_review`, `changes_requested`, `blocked`, `retiring`,
`draft`, `approved`, `live`, `ready_to_publish`, `suppressed`,
`price_review`.

Inventory status: `healthy`, `low_stock`, `stockout_risk`, `test_cap`,
`retiring`.

Review item type: `publish_approval`, `quality_hold`, `price_change`, or a
lifecycle/archive decision.

Decision actions (the only three buttons the review queue exposes):
`approve`, `request_changes`, `block`.

## Products (`kelly-products-products-v1`)

Products, channel rows, inventory rows, and review items enter Busabase only
through `scripts/ingest_products.mjs` (or the operator editing Busabase
directly) — the AirApp itself never creates one.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `product-id` | `product_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number |
| `sku` | `sku` | text | |
| `name` | `name` | text | |
| `subtitle` | `subtitle` | text | |
| `category` | `category` | text | |
| `lifecycle` | `lifecycle` | text | `launch\|active\|test\|archive` |
| `status` | `status` | text | catalog status badge |
| `owner` | `owner` | text | |
| `vendor` | `vendor` | text | supplier/manufacturer |
| `launch-date` | `launch_date` | text | ISO date |
| `image` | `image` | text | hero image URL, e.g. `/assets/product-images/aurora-lamp.png` |
| `gallery` | `gallery` | longtext | JSON array of image URLs |
| `tags` | `tags` | longtext | JSON array of tag strings |
| `pricing` | `pricing` | longtext | JSON object: `cogs`, `landed_cost`, `target_price`, `current_price`, `map_price`, `gross_margin_pct`, `breakeven_acos` |
| `inventory` | `inventory` | longtext | JSON object rollup: `on_hand`, `available`, `reserved`, `inbound`, `days_cover`, `reorder_point`, `reorder_qty` |
| `content` | `content` | longtext | JSON object: `hero_images_ready`, `hero_images_required`, `video_ready`, `listing_source`, `copy_status` |
| `compliance` | `compliance` | longtext | JSON object: `score`, `status`, `notes` (array) |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Channels (`kelly-products-channels-v1`)

One row per product × marketplace channel, keyed by
`channel-id = <product_id>__<platform>`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `channel-id` | `channel_id` | text | `<product_id>__<platform>`, required |
| `product-id` | `product_id` | text | references `products.product-id` |
| `platform` | `platform` | text | `amazon\|shopify\|tiktok_shop\|ebay` |
| `listing-id` | `listing_id` | text | marketplace listing id |
| `status` | `status` | text | `live\|ready_to_publish\|draft\|suppressed\|price_review` |
| `price` | `price` | number | |
| `buybox` | `buybox` | text | `"true"\|"false"\|""` (tri-state; empty = unknown/not applicable) |
| `content-score` | `content_score` | number | 0-100 |
| `issue` | `issue` | longtext | channel issue note; empty means no open issue |
| `next-step` | `next-step` | text | e.g. `approve_publish`, `add_asset` |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Inventory (`kelly-products-inventory-v1`)

One row per product × warehouse, keyed by
`inventory-id = <product_id>__<warehouse_id>`.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `inventory-id` | `inventory_id` | text | `<product_id>__<warehouse_id>`, required |
| `product-id` | `product_id` | text | references `products.product-id` |
| `warehouse-id` | `warehouse_id` | text | references `settings.warehouses[].warehouse_id` |
| `warehouse-name` | `warehouse_name` | text | |
| `on-hand` | `on_hand` | number | |
| `available` | `available` | number | |
| `reserved` | `reserved` | number | |
| `inbound` | `inbound` | number | |
| `inbound-eta` | `inbound_eta` | text | ISO date |
| `days-cover` | `days_cover` | number | |
| `status` | `status` | text | `healthy\|low_stock\|stockout_risk\|test_cap\|retiring` |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Review (`kelly-products-review-v1`)

Approval-gated review queue: channel publish approvals, price-change review,
quality holds, and lifecycle/archive decisions. The operator's decision is
written directly onto this row — there is no separate decisions.json-
equivalent bucket. `scripts/execute_decisions.mjs` writes the `execution-*`
fields after a decision has been recorded.

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `item-id` | `item_id` | text | stable domain id, required |
| `ref` | `ref` | number | stable per-Base row number so the reviewer can say "Review #2" |
| `product-id` | `product_id` | text | references `products.product-id` |
| `type` | `type` | text | `publish_approval\|quality_hold\|price_change\|lifecycle` |
| `status` | `status` | text | `needs_review\|approved\|changes_requested\|blocked` |
| `title` | `title` | text | |
| `summary` | `summary` | longtext | |
| `risk` | `risk` | text | `low\|medium\|high` |
| `recommendation` | `recommendation` | text | the agent's recommended action, e.g. `approve\|block` |
| `evidence` | `evidence` | longtext | JSON array of evidence lines |
| `decision-note` | `decision_note` | longtext | reviewer's note |
| `decided-at` | `decided_at` | text | ISO timestamp |
| `execution-status` | `execution_status` | text | `planned\|ready_for_agent`, written by `execute_decisions.mjs` |
| `execution-detail` | `execution_detail` | longtext | human-readable next step |
| `executed-at` | `executed_at` | text | ISO timestamp |
| `created-at` | `created_at` | text | ISO timestamp |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Settings (`kelly-products-settings-v1`)

A single row, `record-id: "config"`:

| Field slug | App key | Type | Notes |
| --- | --- | --- | --- |
| `record-id` | `record_id` | text | always `"config"`, required |
| `seller-brand` | `seller_brand` | text | |
| `seller-entity` | `seller_entity` | text | |
| `base-currency` | `base_currency` | text | default `USD` |
| `platforms` | `platforms` | longtext | JSON array of `{platform, enabled, store_name}` |
| `warehouses` | `warehouses` | longtext | JSON array of `{warehouse_id, name, region}` |
| `review-policy` | `review_policy` | longtext | JSON object: `price_change_threshold_pct`, `margin_floor_pct`, `low_stock_days`, `channel_publish_requires_approval` |
| `sync` | `sync` | longtext | JSON object: `last_import_at`, `sources` |
| `updated-at` | `updated_at` | text | ISO timestamp |

## Decisions

A human verdict writes `status` (via `statusForVerdict()`), `decision-note`,
and `decided-at` directly onto the review item's own record — there is no
separate decisions file. Since Busabase reads are always live, there is no
staleness overlay to compute (the retired app's `effectiveReviewStatus()` is
gone entirely).

## Execution (`scripts/execute_decisions.mjs`)

The trusted handoff step. Reads review items with a recorded decision
(`approved`/`changes_requested`/`blocked`) and no execution marker yet, and
with `--apply` writes `execution-status`/`execution-detail`/`executed-at`
back onto each — it never changes `status` itself and performs no external
side effect (no publish, no price change, no archive). Operations
(`reviewExecution()` in `products-model.js`):

- `publish_channel` (approve, `publish_approval`) → the agent publishes the approved channel listing outside the app, then records the result.
- `apply_price_change` (approve, `price_change`) → the agent applies the approved price change on the channel(s) outside the app.
- `lift_quality_hold` / `maintain_quality_hold` (approve, `quality_hold`) → depends on the item's `recommendation`.
- `archive_product` (approve, any other type) → the agent archives the SKU outside the app per the lifecycle decision.
- `maintain_block` (block, any type) → keep the product blocked on every channel until the review note's conditions are met.
- `request_revision` (request_changes, any type) → the agent redrafts the recommendation per `decision-note`, then re-ingests with `scripts/ingest_products.mjs`.

## Ingest Payload (`scripts/ingest_products.mjs`)

Accepts a payload shaped like the retired `products_snapshot.json` contract:

```json
{
  "seller": { "brand": "Nimbus Home", "entity": "...", "base_currency": "USD" },
  "platforms": [{ "platform": "amazon", "enabled": true, "store_name": "Nimbus Home US" }],
  "warehouses": [{ "warehouse_id": "wh-sz", "name": "Shenzhen 3PL", "region": "CN-SZ" }],
  "review_policy": { "price_change_threshold_pct": 8, "margin_floor_pct": 32, "low_stock_days": 18 },
  "sync": { "last_import_at": "ISO timestamp", "sources": ["amazon", "shopify"] },
  "products": [{ "product_id": "prod-aurora-lamp", "sku": "NH-AL-01", "name": "...", "...": "see the Products section above" }],
  "channel_matrix": [{ "product_id": "prod-aurora-lamp", "platform": "amazon", "...": "see the Channels section above" }],
  "inventory": [{ "product_id": "prod-aurora-lamp", "warehouse_id": "wh-sz", "...": "see the Inventory section above" }],
  "review_items": [{ "item_id": "review-aurora-launch", "product_id": "prod-aurora-lamp", "...": "see the Review section above" }]
}
```

Upserts every row by natural key (`product_id`, `channel_id`,
`inventory_id`, `item_id`), so re-ingests are idempotent. A re-ingest never
clobbers a human decision already recorded on a review item — `status`/
`decision-note`/`decided-at` are only overwritten by the AirApp's
`decideReview()` once a verdict exists.

## Invariants

- Keep `product_id`, `channel_id`, `inventory_id`, and `item_id` stable across re-ingests.
- Treat external marketplace publishing, price changes, SKU archival, and quality holds as approval-required.
- Product images ship as static files under `app/app/assets/product-images/` (served by `server.js`), referenced by relative URL from `products.image`/`gallery` — never depend on external image URLs.
- Do not commit real seller exports, credentials, `.env*`, or `exports/`.
