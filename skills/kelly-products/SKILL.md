---
name: kelly-products
description: E-commerce product management desk (商品管理台) for catalog master data, SKUs, pricing, inventory, channel status, content assets, compliance notes, lifecycle state, and approval-gated product operations. Use when the user invokes $kelly-products or /kelly-products, asks for 电商商品管理, 商品库, SKU 管理, inventory/reorder, product status across Amazon/Shopify/TikTok Shop/eBay, channel publishing approvals, price-change review, quality holds, product lifecycle/archive decisions, or a visual local demo for managing products.
---

# Kelly Products

## Overview

Use this skill as the seller's product-management command desk. It sits between `kelly-picks` (what to develop), `kelly-listing` (what copy/assets to publish), `kelly-ads` (how it performs in paid channels), and `kelly-inquiry` (what buyers ask). The local UI consolidates product master data, SKU pricing, inventory cover, channel status, asset readiness, compliance notes, lifecycle state, and approval-gated recommendations.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, refresh or prepare the product snapshot, start/reuse the local app with `app/start.sh`, and give the actual local URL. Use chat-only mode only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

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

## Boundary

- The skill may read product exports, inventory sheets, channel status exports, listing handoffs, and local config; it writes only local handoff files by default.
- The app reads and writes local files only. It renders local files, never touches any network beyond `127.0.0.1`, and never publishes listings or changes prices by itself.
- Publishing channels, changing prices, archiving SKUs, and lifting quality holds require a human approval record. The agent executes approved operations outside the app and records the outcome in `execution_report.json`.
- No seller credentials live in this repo. API tokens are referenced by env var name only. Never commit `config.local.json`, env files, `app/.data/`, or `exports/`.

## Local App

Start the desk with:

```bash
skills/kelly-products/app/start.sh
```

The app uses local HTTP on `127.0.0.1`, preferring ports `3000` through `4000`, or `KELLY_PRODUCTS_UI_PORT` when set. `/api/state` reports `app: "kelly-products"`.

Required views:

- `#/overview`: KPI cards, visual product cards, review queue preview, and activity log.
- `#/products` and `#/products/<id>`: catalog and product detail with gallery, pricing, inventory, content readiness, compliance notes, channel matrix, and review cards.
- `#/inventory`: warehouse and days-cover table with low-stock and stockout-risk badges.
- `#/channels`: product × platform status table with channel issue notes and content scores.
- `#/review`: approval queue with `approve` / `request_changes` / `block` decisions.
- `#/settings`: sanitized config, platform connectors, warehouses, data provider, and onboarding state.

Demo mode:

- `?demo=overview`, `?demo=products`, `?demo=inventory`, `?demo=channels`, `?demo=review`, and `?demo=detail` open deterministic mock scenes.
- Use `lang=en` or `lang=zh` for UI language. Demo product names and agent notes localize with the chrome.
- Demo product images are local PNG assets under `assets/product-images/`; demo API responses never read or write files under `app/.data/`.

## File Contract

Read `references/products-schema.md` before editing the app, scripts, or any generated JSON.

- `app/.data/products_snapshot.json`: products, channel matrix, inventory, review items, metrics, activity log.
- `app/.data/decisions.json`: human verdicts keyed by review item id.
- `app/.data/agent_tasks.json`: queued `revise_product_record` or `revise_product_recommendation` work.
- `app/.data/execution_report.json`: sync/export/publish-handoff operations.
- `app/.data/onboarding.json`: onboarding completion marker.
- `app/.data/agent.lock`: temporary lock while the skill writes; the review queue rejects `POST /api/decision` with HTTP 423 while it exists.

Validate a snapshot with:

```bash
node scripts/validate_ui_schema.ts app/.data/products_snapshot.json
```

## Workflow

1. Collect product sources: SKU master sheet, pricing/cost table, warehouse inventory, marketplace/channel exports, content asset checklist, and handoffs from `kelly-picks` or `kelly-listing`.
2. Normalize into `products_snapshot.json` with stable product ids and SKUs. Include local or workspace-relative image paths for product cards.
3. Flag action cards: low stock/reorder, channel suppression, publish approval, price change, quality hold, lifecycle/archive decision, or missing content/compliance evidence.
4. Start the app and send the seller to the relevant view. Use stable refs such as `Review #1` when discussing decisions in chat.
5. Before executing anything external, re-read `decisions.json`, respect the lock, and execute only approved operations. Record concrete results in `execution_report.json`.

## Safety Defaults

- Never invent certifications, test reports, inventory, or supplier facts. Mark them missing and request evidence.
- Do not weaken margin, MAP, low-stock, or compliance gates to make a product pass.
- Keep channel publishing and price changes approval-gated even if the connector credentials are ready.
- Keep demo data deterministic and image-rich so documentation screenshots remain stable.
