#!/usr/bin/env node
// Single write path for product + draft payload JSON. Takes a payload file
// containing { "products": [...], "drafts": [...] } (or a single draft
// object), validates the structure per platform shape, and merges it into
// app/.data/listing_snapshot.json. Refuses to write while agent.lock exists.
//
// Drafts are agent-written listing copy — from product source material or a
// kelly-picks handoff brief. Set product "source" to "manual" or
// "kelly_picks". Run scripts/run_checks.mjs after ingesting to refresh
// compliance results and scores.
//
// Usage: node scripts/ingest_drafts.mjs payload.json
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS, PLATFORM_FIELD_SHAPES } from "../app/server/rules.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(skillDir, "app", ".data");
const snapshotPath = path.join(dataDir, "listing_snapshot.json");
const lockPath = path.join(dataDir, "agent.lock");

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("Usage: node scripts/ingest_drafts.mjs <payload.json>");
  process.exit(1);
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function configSearchPaths() {
  const paths = [];
  if (process.env.KELLY_LISTING_CONFIG) paths.push(process.env.KELLY_LISTING_CONFIG);
  paths.push(path.join(skillDir, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-listing", "config.json"));
  paths.push(path.join(skillDir, "config.example.json"));
  return paths;
}

async function readConfig() {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return config;
  }
  return {};
}

const lock = await readJson(lockPath);
if (lock) {
  console.error(`Refusing to ingest: agent.lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const payloadRaw = await readJson(payloadPath);
if (!payloadRaw) {
  console.error(`Cannot read payload: ${payloadPath}`);
  process.exit(1);
}
const payload = Array.isArray(payloadRaw.products) || Array.isArray(payloadRaw.drafts)
  ? payloadRaw
  : { drafts: [payloadRaw] };
const incomingProducts = payload.products || [];
const incomingDrafts = payload.drafts || [];

const config = await readConfig();
const now = new Date().toISOString();

const SOURCES = new Set(["manual", "kelly_picks"]);
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const IMAGE_STATUSES = new Set(["ready", "missing", "needs_edit"]);

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";
}

function validateProduct(input, index) {
  const errors = [];
  const where = `products[${index}]`;
  for (const key of ["name", "sku"]) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`${where}.${key} must be a non-empty string`);
  }
  if (input.source && !SOURCES.has(input.source)) errors.push(`${where}.source must be manual or kelly_picks`);
  if (input.platforms !== undefined) {
    if (!Array.isArray(input.platforms)) errors.push(`${where}.platforms must be an array`);
    else for (const platform of input.platforms) {
      if (!PLATFORMS.includes(platform)) errors.push(`${where}.platforms contains unknown platform: ${platform}`);
    }
  }
  for (const key of ["features", "keywords", "locales"]) {
    if (input[key] !== undefined && !Array.isArray(input[key])) errors.push(`${where}.${key} must be an array`);
  }
  for (const [key, fields] of [["specs", ["name", "value"]], ["images", ["name", "status"]]]) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key])) {
      errors.push(`${where}.${key} must be an array`);
      continue;
    }
    input[key].forEach((entry, entryIndex) => {
      if (!entry || typeof entry !== "object") errors.push(`${where}.${key}[${entryIndex}] must be an object`);
      else for (const field of fields) {
        if (typeof entry[field] !== "string" || !entry[field]) errors.push(`${where}.${key}[${entryIndex}].${field} must be a non-empty string`);
      }
      if (key === "images" && entry?.status && !IMAGE_STATUSES.has(entry.status)) {
        errors.push(`${where}.images[${entryIndex}].status must be ready, missing, or needs_edit`);
      }
    });
  }
  return errors;
}

function validateDraft(input, index) {
  const errors = [];
  const where = `drafts[${index}]`;
  if (!input.product_id && !(typeof input.product === "string" && input.product.trim())) {
    errors.push(`${where} needs product_id or product (name/SKU)`);
  }
  if (!PLATFORMS.includes(input.platform)) errors.push(`${where}.platform must be one of: ${PLATFORMS.join(", ")}`);
  if (input.status && !STATUSES.has(input.status)) errors.push(`${where}.status is invalid: ${input.status}`);
  const fields = input.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    errors.push(`${where}.fields must be an object`);
    return errors;
  }
  const shape = PLATFORM_FIELD_SHAPES[input.platform];
  if (!shape) return errors;
  for (const key of shape.strings) {
    if (fields[key] !== undefined && typeof fields[key] !== "string") errors.push(`${where}.fields.${key} must be a string`);
  }
  for (const key of shape.arrays) {
    if (fields[key] === undefined) continue;
    if (!Array.isArray(fields[key])) {
      errors.push(`${where}.fields.${key} must be an array`);
    } else if (key === "item_specifics") {
      fields[key].forEach((entry, entryIndex) => {
        if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
          errors.push(`${where}.fields.item_specifics[${entryIndex}] must be { "name", "value" }`);
        }
      });
    }
  }
  const known = new Set([...shape.strings, ...shape.arrays]);
  for (const key of Object.keys(fields)) {
    if (!known.has(key)) errors.push(`${where}.fields.${key} is not a known ${input.platform} field`);
  }
  const required = (config.platforms || []).find((entry) => entry.platform === input.platform)?.rules?.required_fields || shape.default_required;
  const missing = required.filter((key) => {
    const value = fields[key];
    return Array.isArray(value) ? value.length === 0 : !(typeof value === "string" && value.trim());
  });
  if (missing.length) errors.push(`${where}.fields is missing required ${input.platform} fields: ${missing.join(", ")} (checks will also flag this)`);
  return errors;
}

const allErrors = [
  ...incomingProducts.flatMap((input, index) => validateProduct(input, index)),
  ...incomingDrafts.flatMap((input, index) => validateDraft(input, index))
];
// Missing-required-field errors are advisory when the draft is explicitly a
// work-in-progress needs_review draft; hard-fail only on structural problems.
const hardErrors = allErrors.filter((error) => !error.includes("checks will also flag this"));
if (hardErrors.length) {
  console.error("Payload validation failed:");
  for (const error of hardErrors) console.error(`- ${error}`);
  process.exit(1);
}
for (const warning of allErrors.filter((error) => error.includes("checks will also flag this"))) {
  console.error(`warning: ${warning}`);
}

const emptySnapshot = {
  schema_version: "1",
  generated_at: now,
  source: "kelly-listing",
  seller: {
    brand: config.seller?.brand || "",
    entity: config.seller?.entity || ""
  },
  metrics: {
    product_count: 0,
    draft_count: 0,
    drafts_by_platform: {},
    drafts_needs_review: 0,
    drafts_approved: 0,
    drafts_in_revision: 0,
    checks_failed: 0,
    compliance_pass_rate: 0,
    exported_this_week: 0
  },
  products: [],
  drafts: [],
  rules: [],
  checks: [],
  review_items: [],
  activity_log: [],
  warnings: []
};
const snapshot = (await readJson(snapshotPath)) || emptySnapshot;
snapshot.products = snapshot.products || [];
snapshot.drafts = snapshot.drafts || [];
snapshot.checks = snapshot.checks || [];
snapshot.review_items = snapshot.review_items || [];
snapshot.activity_log = snapshot.activity_log || [];

let nextProductRef = Math.max(0, ...snapshot.products.map((product) => Number(product.ref) || 0)) + 1;
let nextDraftRef = Math.max(0, ...snapshot.drafts.map((draft) => Number(draft.ref) || 0)) + 1;

function mergeProduct(input) {
  const productId = input.product_id || `prod-${slugify(input.name)}`;
  const existing = snapshot.products.find((product) => product.product_id === productId);
  const base = {
    name: input.name,
    sku: input.sku,
    category: input.category || existing?.category || "",
    source: input.source || existing?.source || "manual",
    platforms: input.platforms || existing?.platforms || [],
    locales: input.locales || existing?.locales || [],
    specs: input.specs || existing?.specs || [],
    features: input.features || existing?.features || [],
    keywords: input.keywords || existing?.keywords || [],
    images: input.images || existing?.images || [],
    notes: input.notes ?? existing?.notes ?? "",
    updated_at: now
  };
  if (existing) {
    Object.assign(existing, base);
    return { product: existing, created: false };
  }
  const product = { product_id: productId, ref: nextProductRef++, ...base, created_at: now };
  snapshot.products.push(product);
  return { product, created: true };
}

function resolveProductId(input) {
  if (input.product_id) {
    const byId = snapshot.products.find((product) => product.product_id === input.product_id);
    if (byId) return byId.product_id;
  }
  const label = String(input.product || "").trim();
  if (label) {
    const byLabel = snapshot.products.find((product) => product.name === label || product.sku === label);
    if (byLabel) return byLabel.product_id;
  }
  return null;
}

function normalizeFields(platform, fields = {}) {
  const shape = PLATFORM_FIELD_SHAPES[platform];
  const normalized = {};
  for (const key of shape.strings) normalized[key] = typeof fields[key] === "string" ? fields[key] : "";
  for (const key of shape.arrays) {
    normalized[key] = key === "item_specifics"
      ? (Array.isArray(fields[key]) ? fields[key] : []).map((entry) => ({ name: String(entry.name || ""), value: String(entry.value || "") }))
      : (Array.isArray(fields[key]) ? fields[key] : []).map(String);
  }
  return normalized;
}

const mergedProducts = incomingProducts.map(mergeProduct);
const mergedDrafts = [];

for (const input of incomingDrafts) {
  const productId = resolveProductId(input);
  if (!productId) {
    console.error(`drafts: cannot resolve product for ${JSON.stringify(input.product_id || input.product)}; ingest the product first.`);
    process.exit(1);
  }
  const productKey = productId.replace(/^prod-/, "");
  const locale = String(input.locale || "US").toUpperCase();
  const draftId = input.draft_id || `d-${productKey}-${input.platform}-${locale.toLowerCase()}`;
  const fields = normalizeFields(input.platform, input.fields);
  const variantGroup = input.variant_group || `${productKey}-${input.platform}`;
  const existing = snapshot.drafts.find((draft) => draft.draft_id === draftId);
  if (existing) {
    Object.assign(existing, {
      platform: input.platform,
      locale,
      variant_group: variantGroup,
      status: input.status || "needs_review",
      keyword_strategy: input.keyword_strategy ?? existing.keyword_strategy ?? "",
      fields,
      updated_at: now
    });
    mergedDrafts.push({ draft: existing, created: false });
  } else {
    const draft = {
      draft_id: draftId,
      ref: nextDraftRef++,
      product_id: productId,
      platform: input.platform,
      locale,
      variant_group: variantGroup,
      status: input.status || "needs_review",
      compliance_score: 0,
      keyword_strategy: input.keyword_strategy || "",
      fields,
      created_at: now,
      updated_at: now
    };
    snapshot.drafts.push(draft);
    mergedDrafts.push({ draft, created: true });
  }
  const draft = mergedDrafts[mergedDrafts.length - 1].draft;
  let reviewItem = snapshot.review_items.find((item) => item.draft_id === draft.draft_id);
  if (!reviewItem) {
    reviewItem = {
      review_id: `rv-${slugify(draft.draft_id.replace(/^d-/, ""))}`,
      ref: draft.ref,
      draft_id: draft.draft_id,
      status: draft.status,
      compliance_summary: "Checks pending — run scripts/run_checks.mjs.",
      suggestions: [],
      created_at: now
    };
    snapshot.review_items.push(reviewItem);
  } else {
    reviewItem.status = draft.status;
  }
  if (Array.isArray(input.suggestions)) reviewItem.suggestions = input.suggestions.map(String);
  if (typeof input.compliance_summary === "string") reviewItem.compliance_summary = input.compliance_summary;
  snapshot.activity_log.unshift({
    id: `act-${Date.now()}-${draft.ref}`,
    at: now,
    actor: "agent",
    detail: `${mergedDrafts[mergedDrafts.length - 1].created ? "Ingested" : "Updated"} ${draft.platform} ${draft.locale} draft for ${snapshot.products.find((product) => product.product_id === productId)?.name || productId}.`,
    draft_id: draft.draft_id
  });
}

snapshot.activity_log = snapshot.activity_log.slice(0, 50);
snapshot.seller = {
  brand: config.seller?.brand || snapshot.seller?.brand || "",
  entity: config.seller?.entity || snapshot.seller?.entity || ""
};
const byPlatform = {};
for (const draft of snapshot.drafts) byPlatform[draft.platform] = (byPlatform[draft.platform] || 0) + 1;
snapshot.metrics = {
  ...snapshot.metrics,
  product_count: snapshot.products.length,
  draft_count: snapshot.drafts.length,
  drafts_by_platform: byPlatform,
  drafts_needs_review: snapshot.drafts.filter((draft) => draft.status === "needs_review").length,
  drafts_approved: snapshot.drafts.filter((draft) => ["approved", "done"].includes(draft.status)).length,
  drafts_in_revision: snapshot.drafts.filter((draft) => draft.status === "changes_requested").length
};
snapshot.generated_at = now;

await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
for (const { product, created } of mergedProducts) {
  console.log(`${created ? "Created" : "Updated"} ${product.product_id} — ${product.name} (${product.sku})`);
}
for (const { draft, created } of mergedDrafts) {
  console.log(`${created ? "Created" : "Updated"} ${draft.draft_id} (Draft #${draft.ref}) — ${draft.platform} ${draft.locale}`);
}
console.log(`Wrote ${snapshotPath}. Run scripts/run_checks.mjs to refresh compliance results.`);
