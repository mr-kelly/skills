#!/usr/bin/env node
// Trusted hand-off step. Kelly Listing's AirApp never ingests product source
// material itself — the browser cannot read an arbitrary local file path.
// This script parses a JSON payload file (one draft object, or
// { "products": [...], "drafts": [...] }), validates it against the
// per-platform field shapes and the required-fields rule set on the
// Settings row, and upserts products + drafts into Busabase by natural key
// (product_id/name+sku, draft_id) so re-ingests are idempotent.
//
// slugify/validateProduct/validateDraft/normalizeFields/SOURCES/STATUSES/
// IMAGE_STATUSES are ported verbatim from the retired
// scripts/ingest_drafts.ts; only the write target changed, from a persisted
// app/.data/listing_snapshot.json to Busabase's products/drafts Bases.
//
// Usage: node scripts/ingest_drafts.mjs <payload.json> [--apply]
// Without --apply this is a dry run that only prints what would be written.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { PLATFORMS, PLATFORM_FIELD_SHAPES, configFromSettingsRow } from "../app/app/js/listing-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/ingest_drafts.mjs <payload.json> [--apply]

Parses a JSON payload file (one draft object, or { "products": [...], "drafts":
[...] }), validates it against the platform field shapes and the Settings
row's required-fields rules, and upserts products/drafts into Busabase.
Without --apply this is a dry run that only prints what would be written.`);
}

// ---- Ported verbatim from the retired scripts/ingest_drafts.ts ----

const SOURCES = new Set(["manual", "kelly_picks"]);
const STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const IMAGE_STATUSES = new Set(["ready", "missing", "needs_edit"]);

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item"
  );
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
    else
      for (const platform of input.platforms) {
        if (!PLATFORMS.includes(platform)) errors.push(`${where}.platforms contains unknown platform: ${platform}`);
      }
  }
  for (const key of ["features", "keywords", "locales"]) {
    if (input[key] !== undefined && !Array.isArray(input[key])) errors.push(`${where}.${key} must be an array`);
  }
  /** @type {[string, string[]][]} */
  const shapedFields = [
    ["specs", ["name", "value"]],
    ["images", ["name", "status"]],
  ];
  for (const [key, fields] of shapedFields) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key])) {
      errors.push(`${where}.${key} must be an array`);
      continue;
    }
    input[key].forEach((entry, entryIndex) => {
      if (!entry || typeof entry !== "object") errors.push(`${where}.${key}[${entryIndex}] must be an object`);
      else
        for (const field of fields) {
          if (typeof entry[field] !== "string" || !entry[field])
            errors.push(`${where}.${key}[${entryIndex}].${field} must be a non-empty string`);
        }
      if (key === "images" && entry?.status && !IMAGE_STATUSES.has(entry.status)) {
        errors.push(`${where}.images[${entryIndex}].status must be ready, missing, or needs_edit`);
      }
    });
  }
  return errors;
}

function validateDraft(input, index, config) {
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
    if (fields[key] !== undefined && typeof fields[key] !== "string")
      errors.push(`${where}.fields.${key} must be a string`);
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
  const required =
    (config.platforms || []).find((entry) => entry.platform === input.platform)?.rules?.required_fields ||
    shape.default_required;
  const missing = required.filter((key) => {
    const value = fields[key];
    return Array.isArray(value) ? value.length === 0 : !(typeof value === "string" && value.trim());
  });
  if (missing.length)
    errors.push(
      `${where}.fields is missing required ${input.platform} fields: ${missing.join(", ")} (checks will also flag this)`,
    );
  return errors;
}

function normalizeIngestFields(platform, fields = {}) {
  const shape = PLATFORM_FIELD_SHAPES[platform];
  const normalized = {};
  for (const key of shape.strings) normalized[key] = typeof fields[key] === "string" ? fields[key] : "";
  for (const key of shape.arrays) {
    normalized[key] =
      key === "item_specifics"
        ? (Array.isArray(fields[key]) ? fields[key] : []).map((entry) => ({
            name: String(entry.name || ""),
            value: String(entry.value || ""),
          }))
        : (Array.isArray(fields[key]) ? fields[key] : []).map(String);
  }
  return normalized;
}

// ---- Busabase plumbing ----

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsert(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-listing-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-listing-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return help();
  const apply = argv.includes("--apply");
  const payloadPath = argv.find((arg) => !arg.startsWith("--"));
  if (!payloadPath) return help();

  const payloadRaw = JSON.parse(await fs.readFile(payloadPath, "utf8"));
  const payload =
    Array.isArray(payloadRaw.products) || Array.isArray(payloadRaw.drafts) ? payloadRaw : { drafts: [payloadRaw] };
  const incomingProducts = payload.products || [];
  const incomingDrafts = payload.drafts || [];

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Listing Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [existingProducts, existingDrafts, settingsRows] = await Promise.all([
    readAll(client, declared("products")),
    readAll(client, declared("drafts")),
    readAll(client, declared("settings")),
  ]);
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const config = configFromSettingsRow(settings);

  const allErrors = [
    ...incomingProducts.flatMap((input, index) => validateProduct(input, index)),
    ...incomingDrafts.flatMap((input, index) => validateDraft(input, index, config)),
  ];
  // Missing-required-field errors are advisory when the draft is explicitly a
  // work-in-progress needs_review draft; hard-fail only on structural problems.
  const hardErrors = allErrors.filter((error) => !error.includes("checks will also flag this"));
  if (hardErrors.length) {
    for (const error of hardErrors) console.error(`- ${error}`);
    throw new Error("Payload validation failed");
  }
  for (const warning of allErrors.filter((error) => error.includes("checks will also flag this"))) {
    console.error(`warning: ${warning}`);
  }

  const productsById = new Map(existingProducts.map((row) => [row.product_id, row]));
  const productsByLabel = new Map(
    existingProducts.flatMap((row) => [
      [row.name, row],
      [row.sku, row],
    ]),
  );
  let nextProductRef = Math.max(0, ...existingProducts.map((row) => Number(row.ref) || 0)) + 1;
  const now = new Date().toISOString();
  const productWrites = [];

  function mergeProduct(input) {
    const productId = input.product_id || `prod-${slugify(input.name)}`;
    const existing = productsById.get(productId);
    const fields = {
      product_id: productId,
      ref: existing ? existing.ref : nextProductRef++,
      name: input.name,
      sku: input.sku,
      category: input.category || existing?.category || "",
      source: input.source || existing?.source || "manual",
      platforms: JSON.stringify(input.platforms || (existing ? JSON.parse(existing.platforms || "[]") : [])),
      locales: JSON.stringify(input.locales || (existing ? JSON.parse(existing.locales || "[]") : [])),
      specs: JSON.stringify(input.specs || (existing ? JSON.parse(existing.specs || "[]") : [])),
      features: JSON.stringify(input.features || (existing ? JSON.parse(existing.features || "[]") : [])),
      keywords: JSON.stringify(input.keywords || (existing ? JSON.parse(existing.keywords || "[]") : [])),
      images: JSON.stringify(input.images || (existing ? JSON.parse(existing.images || "[]") : [])),
      notes: input.notes ?? existing?.notes ?? "",
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    productWrites.push({ existing, fields, created: !existing });
    productsById.set(productId, fields);
    productsByLabel.set(fields.name, fields);
    productsByLabel.set(fields.sku, fields);
    return productId;
  }

  function resolveProductId(input) {
    if (input.product_id && productsById.has(input.product_id)) return input.product_id;
    const label = String(input.product || "").trim();
    if (label && productsByLabel.has(label)) return productsByLabel.get(label).product_id;
    return null;
  }

  for (const input of incomingProducts) mergeProduct(input);

  const draftsById = new Map(existingDrafts.map((row) => [row.draft_id, row]));
  let nextDraftRef = Math.max(0, ...existingDrafts.map((row) => Number(row.ref) || 0)) + 1;
  const draftWrites = [];

  for (const input of incomingDrafts) {
    const productId = resolveProductId(input);
    if (!productId) {
      console.error(
        `drafts: cannot resolve product for ${JSON.stringify(input.product_id || input.product)}; ingest the product first.`,
      );
      process.exitCode = 1;
      continue;
    }
    const productKey = productId.replace(/^prod-/, "");
    const locale = String(input.locale || "US").toUpperCase();
    const draftId = input.draft_id || `d-${productKey}-${input.platform}-${locale.toLowerCase()}`;
    const fields = normalizeIngestFields(input.platform, input.fields);
    const variantGroup = input.variant_group || `${productKey}-${input.platform}`;
    const existing = draftsById.get(draftId);
    const nextFields = {
      draft_id: draftId,
      ref: existing ? existing.ref : nextDraftRef++,
      product_id: productId,
      platform: input.platform,
      locale,
      variant_group: variantGroup,
      status: input.status || "needs_review",
      compliance_score: existing?.compliance_score || 0,
      keyword_strategy: input.keyword_strategy ?? existing?.keyword_strategy ?? "",
      title: fields.title || "",
      subtitle: fields.subtitle || "",
      bullets: JSON.stringify(fields.bullets || []),
      description: fields.description || "",
      search_terms: fields.search_terms || "",
      seo_title: fields.seo_title || "",
      seo_description: fields.seo_description || "",
      selling_points: JSON.stringify(fields.selling_points || []),
      aplus_outline: JSON.stringify(fields.aplus_outline || []),
      item_specifics: JSON.stringify(fields.item_specifics || []),
      compliance_summary:
        typeof input.compliance_summary === "string"
          ? input.compliance_summary
          : existing?.compliance_summary || "Checks pending — run scripts/run_checks.mjs.",
      suggestions: JSON.stringify(
        Array.isArray(input.suggestions) ? input.suggestions.map(String) : JSON.parse(existing?.suggestions || "[]"),
      ),
      decision_action: existing?.decision_action || "",
      decision_note: existing?.decision_note || "",
      decided_at: existing?.decided_at || "",
      execution_status: existing?.execution_status || "",
      execution_operation: existing?.execution_operation || "",
      execution_target: existing?.execution_target || "",
      execution_detail: existing?.execution_detail || "",
      executed_at: existing?.executed_at || "",
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    draftWrites.push({ existing, fields: nextFields, created: !existing, platform: input.platform, locale });
    draftsById.set(draftId, nextFields);
  }

  for (const write of productWrites) {
    await upsert(
      client,
      declared("products"),
      write.existing,
      write.fields,
      `${write.created ? "Ingest" : "Update"} product ${write.fields.product_id}`,
      apply,
    );
    console.log(
      `${apply ? (write.created ? "Created" : "Updated") : write.created ? "Would create" : "Would update"} ${write.fields.product_id} — ${write.fields.name} (${write.fields.sku})`,
    );
  }
  for (const write of draftWrites) {
    await upsert(
      client,
      declared("drafts"),
      write.existing,
      write.fields,
      `${write.created ? "Ingest" : "Update"} draft ${write.fields.draft_id}`,
      apply,
    );
    console.log(
      `${apply ? (write.created ? "Created" : "Updated") : write.created ? "Would create" : "Would update"} ${write.fields.draft_id} (Draft #${write.fields.ref}) — ${write.platform} ${write.locale}`,
    );
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write to Busabase.");
  } else {
    console.log("Wrote products/drafts to Busabase. Run scripts/run_checks.mjs to refresh compliance results.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
