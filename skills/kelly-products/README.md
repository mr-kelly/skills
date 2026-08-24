# Kelly Products

Kelly Products is a Busabase App-in-Skill product-management desk (商品管理台) for e-commerce sellers. It consolidates SKU master data, pricing, inventory, channel status, content assets, compliance notes, lifecycle state, and an approval-gated review queue.

## What It Shows

- Overview: product KPIs, image-rich product cards, inventory value, margin, recent activity, and review queue preview.
- Products: catalog cards and product detail pages with gallery, pricing, inventory, content readiness, compliance notes, channel matrix, and linked review items.
- Inventory: warehouse availability, inbound stock, days cover, and stockout-risk flags.
- Channels: Amazon/Shopify/TikTok Shop/eBay listing status, content score, price, and channel issue notes.
- Review: approval queue for publishing, price changes, quality holds, and lifecycle decisions.
- Settings: sanitized seller profile, platform connectors, warehouses, review policy, and data-provider state.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Products overview"></td>
    <td width="50%"><img src="assets/screenshots/products.webp" alt="Kelly Products catalog"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Product command desk with visual product cards, margin, inventory value, activity, and approval queue.</td>
    <td><strong>Catalog</strong><br>Image-rich product library with SKU, lifecycle, owner, margin, inventory cover, and status badges.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/detail.webp" alt="Kelly Products detail"></td>
    <td width="50%"><img src="assets/screenshots/review.webp" alt="Kelly Products review queue"></td>
  </tr>
  <tr>
    <td><strong>Product detail</strong><br>Gallery, pricing, inventory, content readiness, compliance notes, channel matrix, and related review cards.</td>
    <td><strong>Review queue</strong><br>Approval-gated publish, price, quality-hold, and lifecycle recommendations with evidence.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/channels.webp" alt="Kelly Products channels"></td>
    <td width="50%"><img src="assets/screenshots/inventory.webp" alt="Kelly Products inventory"></td>
  </tr>
  <tr>
    <td><strong>Channels</strong><br>Per-channel listing matrix across Amazon, Shopify, and TikTok Shop with status, price, score, and channel issues.</td>
    <td><strong>Inventory</strong><br>Stock health across warehouses — on-hand, available, days of cover, and low-stock flags.</td>
  </tr>
</table>

## Demo Mode

Start the AirApp locally and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-products/content/kelly-products-app dev
```

Then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=products&lang=en#/products
/?demo=inventory&lang=en#/inventory
/?demo=channels&lang=en#/channels
/?demo=review&lang=en#/review
/?demo=detail&lang=en#/products/prod-aurora-lamp
```

Use `lang=zh` for Chinese screenshots. Demo mode uses the same real static PNG product images shipped under `content/kelly-products-app/app/assets/product-images/` and never reads or writes Busabase.

## Ingest Payload Format

`scripts/ingest_products.mjs` accepts a payload shaped like the retired local app's `products_snapshot.json` contract:

```json
{
  "seller": { "brand": "Nimbus Home", "base_currency": "USD" },
  "products": [
    {
      "product_id": "prod-aurora-lamp",
      "sku": "NH-AL-01",
      "name": "Aurora Gradient Desk Lamp",
      "image": "/assets/product-images/aurora-lamp.png",
      "pricing": { "current_price": 38.99, "gross_margin_pct": 51.4 },
      "inventory": { "on_hand": 920, "days_cover": 16 }
    }
  ],
  "channel_matrix": [],
  "inventory": [],
  "review_items": []
}
```

Run `node scripts/ingest_products.mjs payload.json --apply` to write it to Busabase (dry run by default). See `references/products-schema.md` for the full Busabase field contract, and `scripts/execute_decisions.mjs` for recording the agent's approved follow-up (publish/price change/archive/quality hold) after a review decision.

## Busabase Setup

Kelly Products provisions its own Folder and five Bases (`products`, `channels`, `inventory`, `review`, `settings`) lazily on first run in a Busabase Space — no manual setup required. See `SKILL.md`'s Busabase Resources section.

## Boundary

The AirApp reads and writes Busabase only — it never publishes a channel listing, changes a price, archives a SKU, or lifts a quality hold by itself. Those actions require a human approval record in the review queue, then the agent executes them outside the app and reports the concrete result. Ingesting products/channels/inventory/review items is a local-file operation performed by the trusted `scripts/ingest_products.mjs` script, never by the browser. Never commit local payload files, env files, or generated exports.
