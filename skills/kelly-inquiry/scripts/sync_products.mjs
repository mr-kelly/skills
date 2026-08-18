#!/usr/bin/env node
// Trusted hand-off step. Kelly Inquiry's AirApp never imports the product
// knowledge base itself (no arbitrary local file access); this script is the
// only process that ever creates/updates product rows. It reads a JSON or
// CSV file (see references/inquiry-schema.md) and upserts them into
// Busabase's Products Base, keyed by product-id.
//
// Ported from the retired scripts/sync_products.ts: same JSON/CSV shapes,
// same zero-dependency CSV parser (RFC 4180-ish, quoted-field support), same
// specs/faq cell encodings ("Power=40W|CRI=>80" and "Q1?=>A1|Q2?=>A2"), same
// price_min/price_max validation and min-price-guard warning — only the
// storage target changed, from app/.data/inquiry_snapshot.json to a Busabase
// ChangeRequest per product.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run).
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/sync_products.mjs <products.json|products.csv> [--apply]

JSON: { "products": [ { product_id, sku, name, ... , specs{}, faq[] } ] } or a bare array.
CSV columns: product_id,sku,name,category,moq,price_min,price_max,currency,lead_time_days,specs,faq
  specs cell:  "Power=40W|CRI=>80"          (key=value pairs joined by |)
  faq cell:    "Q1?=>A1|Q2?=>A2"            (q=>a pairs joined by |)

Upserts every product into Busabase's Products Base, keyed by product-id.
Without --apply this is a dry run that only validates and prints a summary.`);
}

function fail(message) {
  console.error(`Product sync failed: ${message}`);
  process.exit(1);
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas,
// and "" as an escaped quote) — ported verbatim from the retired
// scripts/sync_products.ts.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function parsePairs(cell, separator = "=") {
  const result = {};
  for (const part of String(cell || "").split("|")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf(separator);
    if (index <= 0) continue;
    result[trimmed.slice(0, index).trim()] = trimmed.slice(index + separator.length).trim();
  }
  return result;
}

function parseFaq(cell) {
  const entries = [];
  for (const part of String(cell || "").split("|")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=>");
    if (index <= 0) continue;
    entries.push({ q: trimmed.slice(0, index).trim(), a: trimmed.slice(index + 2).trim() });
  }
  return entries;
}

function fromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) fail("CSV needs a header row and at least one product row");
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const required = ["sku", "name"];
  for (const key of required) {
    if (!header.includes(key)) fail(`CSV header must include "${key}"`);
  }
  return rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = cells[index] !== undefined ? cells[index] : "";
    });
    return {
      product_id: record.product_id || `prod-${record.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      sku: record.sku,
      name: record.name,
      category: record.category || "",
      moq: Number(record.moq) || 0,
      price_min: record.price_min === "" ? undefined : Number(record.price_min),
      price_max: record.price_max === "" ? undefined : Number(record.price_max),
      currency: record.currency || "USD",
      lead_time_days: Number(record.lead_time_days) || 0,
      specs: parsePairs(record.specs),
      faq: parseFaq(record.faq),
    };
  });
}

function fromJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`invalid JSON: ${error.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed.products;
  if (!Array.isArray(list) || !list.length) fail("JSON must be a products array or { products: [...] }");
  return list.map((entry, index) => {
    if (!entry.sku || !entry.name) fail(`products[${index}] needs sku and name`);
    return {
      product_id:
        entry.product_id ||
        `prod-${String(entry.sku)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
      sku: String(entry.sku),
      name: String(entry.name),
      category: String(entry.category || ""),
      moq: Number(entry.moq) || 0,
      price_min: entry.price_min === undefined ? undefined : Number(entry.price_min),
      price_max: entry.price_max === undefined ? undefined : Number(entry.price_max),
      currency: String(entry.currency || "USD"),
      lead_time_days: Number(entry.lead_time_days) || 0,
      specs: entry.specs && typeof entry.specs === "object" ? entry.specs : {},
      faq: Array.isArray(entry.faq) ? entry.faq.filter((item) => item?.q && item.a) : [],
    };
  });
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

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
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsertRow(client, declared, existing, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-inquiry-product-sync",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-inquiry-product-sync",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) return help();
  const apply = rawArgs.includes("--apply");
  const file = rawArgs.find((arg) => !arg.startsWith("--"));
  if (!file) fail("pass a products JSON or CSV file, e.g. node scripts/sync_products.mjs products.csv");

  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
  }

  const incoming = file.toLowerCase().endsWith(".csv") ? fromCsv(raw) : fromJson(raw);

  const seen = new Set();
  for (const item of incoming) {
    if (seen.has(item.product_id)) fail(`duplicate product_id: ${item.product_id}`);
    seen.add(item.product_id);
    if (item.price_min !== undefined && Number.isNaN(item.price_min))
      fail(`${item.product_id}: price_min is not a number`);
    if (item.price_max !== undefined && Number.isNaN(item.price_max))
      fail(`${item.product_id}: price_max is not a number`);
    if (item.price_min !== undefined && item.price_max !== undefined && item.price_min > item.price_max) {
      fail(`${item.product_id}: price_min ${item.price_min} is greater than price_max ${item.price_max}`);
    }
  }

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Inquiry Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [productRows, settingsRows] = await Promise.all([
    readAll(client, declared("products")),
    readAll(client, declared("settings")),
  ]);
  const productsById = new Map(productRows.map((row) => [row.product_id, row]));

  // Validate against the min-price guard config: with the guard enabled every
  // product should carry a price_min floor, otherwise the guard cannot protect it.
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  let guard = {};
  try {
    guard = JSON.parse(settings.quote_defaults || "{}")?.min_price_guard || {};
  } catch {
    guard = {};
  }
  if (guard.enabled) {
    const missing = incoming.filter((item) => item.price_min === undefined);
    if (missing.length) {
      console.warn(
        `Warning: min-price guard is enabled but ${missing.length} product(s) have no price_min: ${missing.map((item) => item.sku).join(", ")}`,
      );
    }
  }

  let created = 0;
  let updated = 0;
  const nowIso = new Date().toISOString();
  for (const item of incoming) {
    const existing = productsById.get(item.product_id);
    const fields = {
      product_id: item.product_id,
      sku: item.sku,
      name: item.name,
      category: item.category || "",
      moq: item.moq,
      price_min: item.price_min === undefined ? 0 : item.price_min,
      price_max: item.price_max === undefined ? (item.price_min ?? 0) : item.price_max,
      currency: item.currency || "USD",
      lead_time_days: item.lead_time_days,
      specs: JSON.stringify(item.specs || {}),
      faq: JSON.stringify(item.faq || []),
    };
    const outcome = await upsertRow(
      client,
      declared("products"),
      existing,
      fields,
      `Sync product ${item.product_id}`,
      apply,
    );
    if (outcome === "created" || outcome === "would_create") created += 1;
    else updated += 1;
  }

  await upsertRow(
    client,
    declared("sync_log"),
    null,
    {
      sync_id: `products-${Date.now()}`,
      account_id: "product-kb",
      method: "manual",
      at: nowIso,
      status: "ok",
      message: `Product KB sync from ${file}: ${created} added, ${updated} updated.`,
      new_messages: 0,
    },
    "Product KB sync log",
    apply,
  );

  console.log(
    `${apply ? "Synced" : "Would sync"}: ${created} added, ${updated} updated (${incoming.length} total) ${apply ? "->" : "for"} Busabase.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
