# Kelly Products

Kelly Products is a local App-in-Skill product-management desk (商品管理台) for e-commerce sellers. It consolidates SKU master data, pricing, inventory, channel status, content assets, compliance notes, lifecycle state, and approval-gated operations in a visual local UI.

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
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-products/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=products&lang=en#/products
/?demo=inventory&lang=en#/inventory
/?demo=channels&lang=en#/channels
/?demo=review&lang=en#/review
/?demo=detail&lang=en#/products/prod-aurora-lamp
```

Use `lang=zh` for Chinese screenshots. Demo mode uses local PNG product images under `assets/product-images/` and never reads or writes files under `app/.data/`.

## Payload Format

The UI snapshot lives at `app/.data/products_snapshot.json`:

```json
{
  "schema_version": "1",
  "generated_at": "2026-07-07T09:00:00.000Z",
  "seller": { "brand": "Nimbus Home", "base_currency": "USD" },
  "metrics": { "product_count": 5, "low_stock_count": 2 },
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

Run `node scripts/validate_ui_schema.ts app/.data/products_snapshot.json` before relying on a snapshot. See `references/products-schema.md` for the full contract.

## Boundary

The app renders local files only and never publishes listings, changes prices, archives SKUs, or lifts quality holds by itself. Those actions require approval in the review queue, then the agent executes them outside the app and records the result. Never commit seller data: `config.local.json`, `.env*`, `app/.data/`, and `exports/` are gitignored.
