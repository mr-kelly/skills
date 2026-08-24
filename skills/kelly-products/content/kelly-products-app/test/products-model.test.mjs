import assert from "node:assert/strict";
import test from "node:test";
import {
  DECISION_ACTIONS,
  assembleSnapshot,
  buildConfigSummary,
  channelToFields,
  channelsFor,
  computeMetrics,
  filteredProducts,
  inventoryFor,
  inventoryToFields,
  normalizeChannelRow,
  normalizeInventoryRow,
  normalizeProductRow,
  normalizeReviewRow,
  parseJsonValue,
  productToFields,
  reviewFor,
  reviewToFields,
  statusForVerdict,
} from "../app/js/products-model.js";

test("parseJsonValue: parses valid JSON, falls back on empty/invalid input", () => {
  assert.deepEqual(parseJsonValue("[1,2,3]", []), [1, 2, 3]);
  assert.deepEqual(parseJsonValue("", []), []);
  assert.deepEqual(parseJsonValue("not json", { a: 1 }), { a: 1 });
  assert.deepEqual(parseJsonValue(undefined, null), null);
});

test("productToFields/normalizeProductRow round trip preserves every field, including JSON-encoded blocks", () => {
  const product = {
    product_id: "prod-aurora-lamp",
    ref: 1,
    sku: "NH-AL-01",
    name: "Aurora Gradient Desk Lamp",
    subtitle: "USB-C aluminum lamp",
    category: "Home Office Lighting",
    lifecycle: "launch",
    status: "needs_review",
    owner: "Mia",
    vendor: "Dongguan Lumenworks",
    launch_date: "2026-07-18",
    image: "/assets/product-images/aurora-lamp.png",
    gallery: ["/assets/product-images/aurora-lamp.png", "/assets/product-images/aurora-lamp-lifestyle.png"],
    tags: ["new launch", "hero SKU"],
    pricing: { cogs: 11.8, landed_cost: 15.25, gross_margin_pct: 51.4 },
    inventory: { on_hand: 920, days_cover: 16 },
    content: { hero_images_ready: 5, hero_images_required: 6, video_ready: false },
    compliance: { score: 86, status: "warn", notes: ["EU energy-label image missing."] },
    created_at: "2026-06-20T02:00:00.000Z",
    updated_at: "2026-07-07T07:52:00.000Z",
  };
  const fields = productToFields(product);
  const roundTripped = normalizeProductRow(fields);
  assert.deepEqual(roundTripped, product);
});

test("channelToFields/normalizeChannelRow round trip preserves buybox tri-state (true/false/null)", () => {
  const withTrue = normalizeChannelRow(
    channelToFields({ channel_id: "p1__amazon", product_id: "p1", platform: "amazon", buybox: true }),
  );
  const withFalse = normalizeChannelRow(
    channelToFields({ channel_id: "p1__amazon", product_id: "p1", platform: "amazon", buybox: false }),
  );
  const withNull = normalizeChannelRow(
    channelToFields({ channel_id: "p1__amazon", product_id: "p1", platform: "amazon", buybox: null }),
  );
  assert.equal(withTrue.buybox, true);
  assert.equal(withFalse.buybox, false);
  assert.equal(withNull.buybox, null);
});

test("channel-id defaults to product_id__platform when not supplied", () => {
  const fields = channelToFields({ product_id: "prod-lunchbox", platform: "amazon" });
  assert.equal(fields.channel_id, "prod-lunchbox__amazon");
});

test("inventoryToFields/normalizeInventoryRow round trip preserves every field", () => {
  const item = {
    inventory_id: "prod-aurora-lamp__wh-sz",
    product_id: "prod-aurora-lamp",
    warehouse_id: "wh-sz",
    warehouse_name: "Shenzhen 3PL",
    on_hand: 920,
    available: 712,
    reserved: 134,
    inbound: 1800,
    inbound_eta: "2026-07-14",
    days_cover: 16,
    status: "low_stock",
    updated_at: "2026-07-07T07:51:00.000Z",
  };
  assert.deepEqual(normalizeInventoryRow(inventoryToFields(item)), item);
});

test("reviewToFields/normalizeReviewRow round trip preserves every field, including JSON evidence array", () => {
  const item = {
    item_id: "review-aurora-launch",
    ref: 1,
    product_id: "prod-aurora-lamp",
    type: "publish_approval",
    status: "needs_review",
    title: "Approve Aurora Lamp Amazon launch",
    summary: "Publish Amazon US at $38.99.",
    risk: "medium",
    recommendation: "approve",
    evidence: ["Gross margin 51.4%, above 32% floor.", "Inventory cover is only 16 days."],
    decision_note: "",
    decided_at: "",
    execution_status: "",
    execution_detail: "",
    executed_at: "",
    created_at: "2026-07-07T08:00:00.000Z",
    updated_at: "2026-07-07T08:00:00.000Z",
  };
  assert.deepEqual(normalizeReviewRow(reviewToFields(item)), item);
});

test("statusForVerdict: worked example over the three review-queue actions", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  assert.equal(statusForVerdict("unknown", "needs_review"), "needs_review");
});

test("DECISION_ACTIONS matches the three buttons the retired review queue actually exposed", () => {
  assert.deepEqual([...DECISION_ACTIONS].sort(), ["approve", "block", "request_changes"]);
});

test("channelsFor/inventoryFor/reviewFor join helpers filter by product_id", () => {
  const channels = [
    { product_id: "p1", platform: "amazon" },
    { product_id: "p2", platform: "shopify" },
  ];
  const inventory = [
    { product_id: "p1", warehouse_id: "wh-1" },
    { product_id: "p2", warehouse_id: "wh-2" },
  ];
  const reviewItems = [
    { product_id: "p1", item_id: "r1" },
    { product_id: "p2", item_id: "r2" },
  ];
  assert.equal(channelsFor(channels, "p1").length, 1);
  assert.equal(inventoryFor(inventory, "p2").warehouse_id, "wh-2");
  assert.equal(inventoryFor(inventory, "missing"), null);
  assert.equal(reviewFor(reviewItems, "p1")[0].item_id, "r1");
});

test("filteredProducts: matches name/sku/category/owner/vendor/tags, case-insensitively", () => {
  const products = [
    {
      name: "Aurora Gradient Desk Lamp",
      sku: "NH-AL-01",
      category: "Lighting",
      owner: "Mia",
      vendor: "Lumenworks",
      tags: ["hero SKU"],
    },
    {
      name: "Collapsible Silicone Lunch Box",
      sku: "NH-LB-01",
      category: "Kitchen",
      owner: "Noah",
      vendor: "Foldware",
      tags: [],
    },
  ];
  assert.equal(filteredProducts(products, "").length, 2);
  assert.equal(filteredProducts(products, "aurora").length, 1);
  assert.equal(filteredProducts(products, "NH-LB-01").length, 1);
  assert.equal(filteredProducts(products, "hero sku").length, 1);
  assert.equal(filteredProducts(products, "nomatch").length, 0);
});

test("computeMetrics: worked example over the retired demo.ts's five products", () => {
  const products = [
    {
      lifecycle: "launch",
      status: "needs_review",
      pricing: { gross_margin_pct: 51.4, landed_cost: 15.25 },
      inventory: { available: 712 },
    },
    {
      lifecycle: "active",
      status: "active",
      pricing: { gross_margin_pct: 47.1, landed_cost: 7.45 },
      inventory: { available: 3820 },
    },
    {
      lifecycle: "active",
      status: "blocked",
      pricing: { gross_margin_pct: 28.3, landed_cost: 12.9 },
      inventory: { available: 420 },
    },
    {
      lifecycle: "test",
      status: "needs_review",
      pricing: { gross_margin_pct: 44.8, landed_cost: 10.85 },
      inventory: { available: 510 },
    },
    {
      lifecycle: "archive",
      status: "retiring",
      pricing: { gross_margin_pct: 32.9, landed_cost: 9.3 },
      inventory: { available: 231 },
    },
  ];
  const channels = [{ issue: "Needs approval" }, { issue: "" }, { issue: "" }];
  const inventory = [{ status: "low_stock" }, { status: "healthy" }, { status: "stockout_risk" }];
  const metrics = computeMetrics(products, channels, inventory);
  assert.equal(metrics.product_count, 5);
  assert.equal(metrics.active_count, 4);
  assert.equal(metrics.needs_review_count, 2);
  assert.equal(metrics.low_stock_count, 2);
  assert.equal(metrics.channel_issue_count, 1);
  assert.equal(metrics.avg_margin_pct, 40.9);
});

test("assembleSnapshot: assembles the full snapshot, warns only when both products and review_items are empty", () => {
  const empty = assembleSnapshot({});
  assert.equal(empty.warnings.length, 1);
  assert.equal(empty.warnings[0].id, "no-snapshot");

  const withProducts = assembleSnapshot({
    products: [{ product_id: "p1", ref: 1, pricing: {}, inventory: {} }],
  });
  assert.equal(withProducts.warnings.length, 0);
  assert.equal(withProducts.metrics.product_count, 1);
});

test("assembleSnapshot: derives an activity log from product/review timestamps when none is supplied", () => {
  const snapshot = assembleSnapshot({
    products: [{ product_id: "p1", ref: 1, name: "Aurora Lamp", updated_at: "2026-07-07T07:52:00.000Z" }],
    review_items: [
      {
        item_id: "r1",
        ref: 1,
        product_id: "p1",
        title: "Approve launch",
        status: "approved",
        decision_note: "Looks good",
        decided_at: "2026-07-07T08:00:00.000Z",
      },
    ],
  });
  assert.equal(snapshot.activity_log.length, 2);
  assert.match(snapshot.activity_log[0].text, /Approved Approve launch: Looks good/);
});

test("buildConfigSummary: reads seller/platforms/warehouses/review-policy/sync off a raw Settings row", () => {
  const summary = buildConfigSummary({
    settings: {
      seller_brand: "Nimbus Home",
      seller_entity: "Nimbus Home Trading Co., Ltd.",
      base_currency: "USD",
      platforms: JSON.stringify([{ platform: "amazon", enabled: true, store_name: "Nimbus Home US" }]),
      warehouses: JSON.stringify([{ warehouse_id: "wh-sz", name: "Shenzhen 3PL", region: "CN-SZ" }]),
      review_policy: JSON.stringify({ margin_floor_pct: 32 }),
      sync: JSON.stringify({ sources: ["amazon"] }),
    },
  });
  assert.equal(summary.seller.brand, "Nimbus Home");
  assert.equal(summary.platforms[0].platform, "amazon");
  assert.equal(summary.warehouses[0].warehouse_id, "wh-sz");
  assert.equal(summary.review_policy.margin_floor_pct, 32);
  assert.deepEqual(summary.sync.sources, ["amazon"]);
});
