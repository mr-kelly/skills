// Pure domain helpers for Kelly Products, ported from the retired
// app/server/demo.ts (dataset shape + inline metrics()/demoActivity()) and
// the retired app/app.js (filteredProducts/channelsFor/inventoryFor/
// reviewFor/effectiveReviewStatus join+filter helpers). Only TS types were
// stripped and DOM/fetch references removed -- same variable names, same
// order of operations.
//
// The retired app/server/store.ts only ever persisted a separate
// app/.data/decisions.json handoff bucket for review verdicts
// (applyDecision()); this Busabase-only shape replaces that with a direct
// field write onto the review item's own record (status/decision-note/
// decided-at), matching the kelly-legal-contracts/kelly-crm precedent. Since
// Busabase reads are always live, the retired app.js's
// effectiveReviewStatus() "compare decided_at vs generated_at staleness"
// overlay is gone entirely -- a review item's `status` field is always the
// current truth.
//
// products/channel_matrix/inventory/review_items enter Busabase only through
// the agent's own ingest workflow (scripts/ingest_products.mjs, mirroring
// kelly-legal-contracts' scripts/ingest_contracts.mjs) -- the browser itself
// only ever decides on a review item (approve/request_changes/block), it
// never creates a product, channel row, or inventory row. See
// busabase-provider.js's comments and SKILL.md's Boundary.

export function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ---- Normalization: Busabase rows (already snake_cased by the provider) -> item shapes ----

export function normalizeProductRow({
  product_id = "",
  ref = 0,
  sku = "",
  name = "",
  subtitle = "",
  category = "",
  lifecycle = "active",
  status = "active",
  owner = "",
  vendor = "",
  launch_date = "",
  image = "",
  gallery = "",
  tags = "",
  pricing = "",
  inventory = "",
  content = "",
  compliance = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    product_id,
    ref: Number(ref) || 0,
    sku,
    name: name || product_id,
    subtitle,
    category,
    lifecycle,
    status,
    owner,
    vendor,
    launch_date,
    image,
    gallery: parseJsonValue(gallery, []) || [],
    tags: parseJsonValue(tags, []) || [],
    pricing: parseJsonValue(pricing, {}) || {},
    inventory: parseJsonValue(inventory, {}) || {},
    content: parseJsonValue(content, {}) || {},
    compliance: parseJsonValue(compliance, {}) || {},
    created_at,
    updated_at,
  };
}

export function productToFields(product = {}) {
  return {
    product_id: product.product_id || "",
    ref: product.ref || 0,
    sku: product.sku || "",
    name: product.name || "",
    subtitle: product.subtitle || "",
    category: product.category || "",
    lifecycle: product.lifecycle || "active",
    status: product.status || "active",
    owner: product.owner || "",
    vendor: product.vendor || "",
    launch_date: product.launch_date || "",
    image: product.image || "",
    gallery: JSON.stringify(product.gallery || []),
    tags: JSON.stringify(product.tags || []),
    pricing: JSON.stringify(product.pricing || {}),
    inventory: JSON.stringify(product.inventory || {}),
    content: JSON.stringify(product.content || {}),
    compliance: JSON.stringify(product.compliance || {}),
    created_at: product.created_at || new Date().toISOString(),
    updated_at: product.updated_at || new Date().toISOString(),
  };
}

export function normalizeChannelRow({
  channel_id = "",
  product_id = "",
  platform = "",
  listing_id = "",
  status = "draft",
  price = 0,
  buybox = "",
  content_score = 0,
  issue = "",
  next_step = "",
  updated_at = "",
} = {}) {
  return {
    channel_id: channel_id || `${product_id}__${platform}`,
    product_id,
    platform,
    listing_id,
    status,
    price: Number(price) || 0,
    buybox: buybox === "true" ? true : buybox === "false" ? false : null,
    content_score: Number(content_score) || 0,
    issue,
    next_step,
    updated_at,
  };
}

export function channelToFields(channel = {}) {
  return {
    channel_id: channel.channel_id || `${channel.product_id}__${channel.platform}`,
    product_id: channel.product_id || "",
    platform: channel.platform || "",
    listing_id: channel.listing_id || "",
    status: channel.status || "draft",
    price: channel.price || 0,
    buybox: channel.buybox === true ? "true" : channel.buybox === false ? "false" : "",
    content_score: channel.content_score || 0,
    issue: channel.issue || "",
    next_step: channel.next_step || "",
    updated_at: channel.updated_at || new Date().toISOString(),
  };
}

export function normalizeInventoryRow({
  inventory_id = "",
  product_id = "",
  warehouse_id = "",
  warehouse_name = "",
  on_hand = 0,
  available = 0,
  reserved = 0,
  inbound = 0,
  inbound_eta = "",
  days_cover = 0,
  status = "healthy",
  updated_at = "",
} = {}) {
  return {
    inventory_id: inventory_id || `${product_id}__${warehouse_id}`,
    product_id,
    warehouse_id,
    warehouse_name,
    on_hand: Number(on_hand) || 0,
    available: Number(available) || 0,
    reserved: Number(reserved) || 0,
    inbound: Number(inbound) || 0,
    inbound_eta,
    days_cover: Number(days_cover) || 0,
    status,
    updated_at,
  };
}

export function inventoryToFields(item = {}) {
  return {
    inventory_id: item.inventory_id || `${item.product_id}__${item.warehouse_id}`,
    product_id: item.product_id || "",
    warehouse_id: item.warehouse_id || "",
    warehouse_name: item.warehouse_name || "",
    on_hand: item.on_hand || 0,
    available: item.available || 0,
    reserved: item.reserved || 0,
    inbound: item.inbound || 0,
    inbound_eta: item.inbound_eta || "",
    days_cover: item.days_cover || 0,
    status: item.status || "healthy",
    updated_at: item.updated_at || new Date().toISOString(),
  };
}

export function normalizeReviewRow({
  item_id = "",
  ref = 0,
  product_id = "",
  type = "publish_approval",
  status = "needs_review",
  title = "",
  summary = "",
  risk = "medium",
  recommendation = "",
  evidence = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_detail = "",
  executed_at = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    item_id,
    ref: Number(ref) || 0,
    product_id,
    type,
    status,
    title,
    summary,
    risk,
    recommendation,
    evidence: parseJsonValue(evidence, []) || [],
    decision_note,
    decided_at,
    execution_status,
    execution_detail,
    executed_at,
    created_at,
    updated_at,
  };
}

export function reviewToFields(item = {}) {
  return {
    item_id: item.item_id || "",
    ref: item.ref || 0,
    product_id: item.product_id || "",
    type: item.type || "publish_approval",
    status: item.status || "needs_review",
    title: item.title || "",
    summary: item.summary || "",
    risk: item.risk || "medium",
    recommendation: item.recommendation || "",
    evidence: JSON.stringify(item.evidence || []),
    decision_note: item.decision_note || "",
    decided_at: item.decided_at || "",
    execution_status: item.execution_status || "",
    execution_detail: item.execution_detail || "",
    executed_at: item.executed_at || "",
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || new Date().toISOString(),
  };
}

// Sanitized config summary for #/settings -- reads straight off the live
// Settings row. Shape mirrors the retired app/server/store.ts's
// summarizeConfig(), minus secret-env bookkeeping (no local env/token
// concept survives in the Busabase-only shape; platform connectivity is
// tracked outside this app).
/**
 * @param {{ settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ settings = {} } = {}) {
  return {
    config_path: "busabase",
    is_example: false,
    seller: {
      brand: settings.seller_brand || "",
      entity: settings.seller_entity || "",
      base_currency: settings.base_currency || "USD",
    },
    platforms: parseJsonValue(settings.platforms, []) || [],
    warehouses: parseJsonValue(settings.warehouses, []) || [],
    review_policy: parseJsonValue(settings.review_policy, {}) || {},
    sync: parseJsonValue(settings.sync, {}) || {},
  };
}

// ---- Joins/filters, ported from the retired app/app.js ----

export function channelsFor(channels = [], productId = "") {
  return channels.filter((item) => item.product_id === productId);
}

export function inventoryFor(inventory = [], productId = "") {
  return inventory.find((item) => item.product_id === productId) || null;
}

export function reviewFor(reviewItems = [], productId = "") {
  return reviewItems.filter((item) => item.product_id === productId);
}

export function filteredProducts(products = [], query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter((product) =>
    [product.name, product.sku, product.category, product.owner, product.vendor, ...(product.tags || [])]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

// ---- Metrics, ported verbatim from the retired app/server/demo.ts's
// metrics() -- same field names, same rollup logic. ----

function money(value = 0) {
  return Math.round(value * 100) / 100;
}

export function computeMetrics(products = [], channels = [], inventory = []) {
  const active = products.filter((product) => ["active", "launch", "test"].includes(product.lifecycle)).length;
  const needsReview = products.filter((product) => product.status === "needs_review").length;
  const lowStock = inventory.filter((item) => ["low_stock", "stockout_risk"].includes(item.status)).length;
  const channelIssues = channels.filter((item) => item.issue).length;
  const marginAvg = products.length
    ? products.reduce((sum, product) => sum + (product.pricing?.gross_margin_pct || 0), 0) / products.length
    : 0;
  const inventoryValue = products.reduce(
    (sum, product) => sum + (product.inventory?.available || 0) * (product.pricing?.landed_cost || 0),
    0,
  );
  return {
    product_count: products.length,
    active_count: active,
    needs_review_count: needsReview,
    low_stock_count: lowStock,
    channel_issue_count: channelIssues,
    avg_margin_pct: money(marginAvg),
    inventory_value: money(inventoryValue),
  };
}

// ---- Review decision -> status mapping, ported verbatim from the retired
// app/app.js's DECISION_STATUS table (the only three actions the retired
// review queue actually exposed as buttons -- "revise" existed in
// app/server/store.ts's DECISION_ACTIONS but only reachable by queuing an
// internal agent_tasks entry, which has no Busabase-only equivalent since
// agent execution happens entirely outside this app). ----

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "block"]);

export function statusForVerdict(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus;
}

// New orchestration (not a port): derives a recent-activity feed from each
// product's and review item's own timestamps instead of reading a persisted
// activity_log.json, since Busabase reads are always live and there is no
// staleness to paper over (mirrors kelly-legal-contracts'
// deriveActivityLog()). The retired app/server/demo.ts's hand-authored
// demoActivity() narrative strings are kept verbatim in the demo provider
// instead, since they reference specific facts (inventory cover falling
// below a threshold, a listing being suppressed) that are richer than a
// generic timestamp-derived line.
export function deriveActivityLog(products = [], reviewItems = [], { limit = 50 } = {}) {
  const entries = [];
  for (const product of products) {
    if (product.updated_at) {
      entries.push({
        id: `act-${product.product_id}-updated`,
        at: product.updated_at,
        actor: "agent",
        text: `Updated ${product.name || product.product_id}.`,
      });
    }
  }
  for (const item of reviewItems) {
    if (item.decided_at && item.decision_note !== undefined) {
      const label =
        item.status === "approved"
          ? "Approved"
          : item.status === "changes_requested"
            ? "Requested changes on"
            : "Blocked";
      entries.push({
        id: `act-${item.item_id}-decision`,
        at: item.decided_at,
        actor: "seller",
        text: `${label} ${item.title || item.item_id}${item.decision_note ? `: ${item.decision_note}` : "."}`,
      });
    }
  }
  return entries.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// Pure assembly on already-parsed products/channels/inventory/review_items
// (fields as real objects/arrays, not JSON strings) plus a seller summary.
// Used by both the demo provider (which builds its fixtures already in this
// shape) and buildSnapshot() below for the Busabase-row path.
export function assembleSnapshot({
  products = [],
  channel_matrix = [],
  inventory = [],
  review_items = [],
  activity_log = null,
  seller = {},
  now = new Date().toISOString(),
} = {}) {
  const sortedProducts = [...products].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const sortedReviewItems = [...review_items].sort((a, b) => (a.ref || 0) - (b.ref || 0));
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-products",
    seller,
    metrics: computeMetrics(sortedProducts, channel_matrix, inventory),
    products: sortedProducts,
    channel_matrix,
    inventory,
    review_items: sortedReviewItems,
    activity_log: activity_log || deriveActivityLog(sortedProducts, sortedReviewItems),
    warnings:
      sortedProducts.length || sortedReviewItems.length
        ? []
        : [
            {
              id: "no-snapshot",
              severity: "info",
              message:
                "No product snapshot exists yet. Import products or ask the agent to prepare a product-management snapshot.",
            },
          ],
  };
  return snapshot;
}

// Adapted from the retired SKILL.md workflow's step 5 ("execute only approved
// operations, record concrete results in execution_report.json"): maps a
// decided review item to the concrete follow-up operation the agent must
// perform outside the app, and the target the operation acts on. The retired
// app wrote a list of ExecutionResult entries to a separate
// execution_report.json; this shape writes one execution marker directly
// onto the review item's own record instead (see scripts/execute_decisions.mjs).
export function reviewExecution(item, decision, productName = "", { apply = false } = {}) {
  const status = apply ? "ready_for_agent" : "planned";
  if (decision.action === "request_changes") {
    return {
      operation: "request_revision",
      target: item.item_id,
      status,
      detail: "Redraft the recommendation per the review note, then re-ingest with scripts/ingest_products.mjs.",
    };
  }
  if (decision.action === "block") {
    return {
      operation: "maintain_block",
      target: item.product_id,
      status,
      detail: `Keep ${productName || item.product_id} blocked on every channel until the review note's conditions are met.`,
    };
  }
  if (decision.action !== "approve") return null;
  if (item.type === "publish_approval") {
    return {
      operation: "publish_channel",
      target: item.product_id,
      status,
      detail: `Publish the approved channel listing for ${productName || item.product_id} outside the app, then record the result.`,
    };
  }
  if (item.type === "price_change") {
    return {
      operation: "apply_price_change",
      target: item.product_id,
      status,
      detail: `Apply the approved price change for ${productName || item.product_id} on the channel(s) outside the app.`,
    };
  }
  if (item.type === "quality_hold") {
    return {
      operation: item.recommendation === "block" ? "maintain_quality_hold" : "lift_quality_hold",
      target: item.product_id,
      status,
      detail:
        item.recommendation === "block"
          ? `Keep the quality hold on ${productName || item.product_id} in place.`
          : `Lift the quality hold on ${productName || item.product_id} and resume channel publishing.`,
    };
  }
  return {
    operation: "archive_product",
    target: item.product_id,
    status,
    detail: `Archive ${productName || item.product_id} outside the app per the lifecycle decision.`,
  };
}

// Busabase-row wrapper: normalizes the raw products/channels/inventory/review
// rows read from Busabase (already snake_cased by the provider) into item
// shapes, pulls the seller profile off the live Settings row, then calls
// assembleSnapshot().
export function buildSnapshot({
  products = [],
  channels = [],
  inventory = [],
  reviewItems = [],
  settings = {},
  now = new Date().toISOString(),
} = {}) {
  const configSummary = buildConfigSummary({ settings });
  return assembleSnapshot({
    products: products.map(normalizeProductRow),
    channel_matrix: channels.map(normalizeChannelRow),
    inventory: inventory.map(normalizeInventoryRow),
    review_items: reviewItems.map(normalizeReviewRow),
    seller: configSummary.seller,
    now,
  });
}
