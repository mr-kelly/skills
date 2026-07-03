#!/usr/bin/env node
// Imports or refreshes the product knowledge base from a JSON or CSV file.
// Usage:
//   node scripts/sync_products.mjs /path/to/products.json
//   node scripts/sync_products.mjs /path/to/products.csv
//
// JSON: { "products": [ { product_id, sku, name, ... , specs{}, faq[] } ] } or a bare array.
// CSV columns: product_id,sku,name,category,moq,price_min,price_max,currency,lead_time_days,specs,faq
//   specs cell:  "Power=40W|CRI=>80"          (key=value pairs joined by |)
//   faq cell:    "Q1?=>A1|Q2?=>A2"            (q=>a pairs joined by |)
import fs from "node:fs/promises";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  readConfig,
  readLock,
  readSnapshot,
  recomputeMetrics,
  writeJson
} from "../app/server/store.mjs";

function fail(message) {
  console.error(`Product sync failed: ${message}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail("pass a products JSON or CSV file, e.g. node scripts/sync_products.mjs products.csv");

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

let raw;
try {
  raw = await fs.readFile(file, "utf8");
} catch (error) {
  fail(`cannot read ${file}: ${error.message}`);
}

// Small CSV parser with quoted-field support (RFC 4180 style: "" escapes a quote).
export function parseCsv(text) {
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
      faq: parseFaq(record.faq)
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
      product_id: entry.product_id || `prod-${String(entry.sku).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      sku: String(entry.sku),
      name: String(entry.name),
      category: String(entry.category || ""),
      moq: Number(entry.moq) || 0,
      price_min: entry.price_min === undefined ? undefined : Number(entry.price_min),
      price_max: entry.price_max === undefined ? undefined : Number(entry.price_max),
      currency: String(entry.currency || "USD"),
      lead_time_days: Number(entry.lead_time_days) || 0,
      specs: entry.specs && typeof entry.specs === "object" ? entry.specs : {},
      faq: Array.isArray(entry.faq) ? entry.faq.filter((item) => item && item.q && item.a) : []
    };
  });
}

const incoming = file.toLowerCase().endsWith(".csv") ? fromCsv(raw) : fromJson(raw);

const seen = new Set();
for (const product of incoming) {
  if (seen.has(product.product_id)) fail(`duplicate product_id: ${product.product_id}`);
  seen.add(product.product_id);
  if (product.price_min !== undefined && Number.isNaN(product.price_min)) fail(`${product.product_id}: price_min is not a number`);
  if (product.price_max !== undefined && Number.isNaN(product.price_max)) fail(`${product.product_id}: price_max is not a number`);
  if (product.price_min !== undefined && product.price_max !== undefined && product.price_min > product.price_max) {
    fail(`${product.product_id}: price_min ${product.price_min} is greater than price_max ${product.price_max}`);
  }
}

// Validate against the min-price guard config: with the guard enabled every
// product should carry a price_min floor, otherwise the guard cannot protect it.
const { config } = await readConfig();
const guard = config.quote_defaults?.min_price_guard;
if (guard?.enabled) {
  const missing = incoming.filter((product) => product.price_min === undefined);
  if (missing.length) {
    console.warn(`Warning: min-price guard is enabled but ${missing.length} product(s) have no price_min: ${missing.map((product) => product.sku).join(", ")}`);
  }
}

const lock = await readLock();
if (lock) {
  console.error(`Product sync refused: agent lock is active (${lock.owner || "unknown"}: ${lock.message || ""}).`);
  process.exit(1);
}

const nowIso = new Date().toISOString();
await writeJson(LOCK_PATH, { owner: "kelly-inquiry", message: `Syncing product KB from ${file}`, started_at: nowIso });
try {
  const snapshot = await readSnapshot();
  snapshot.source = "kelly-inquiry";
  snapshot.warnings = (snapshot.warnings || []).filter((warning) => warning.id !== "no-snapshot");
  const byId = new Map((snapshot.products || []).map((product) => [product.product_id, product]));
  let updated = 0;
  let created = 0;
  for (const product of incoming) {
    const normalized = {
      ...product,
      price_min: product.price_min === undefined ? 0 : product.price_min,
      price_max: product.price_max === undefined ? (product.price_min ?? 0) : product.price_max
    };
    if (byId.has(product.product_id)) {
      Object.assign(byId.get(product.product_id), normalized);
      updated += 1;
    } else {
      byId.set(product.product_id, normalized);
      created += 1;
    }
  }
  snapshot.products = [...byId.values()];
  snapshot.sync_log = Array.isArray(snapshot.sync_log) ? snapshot.sync_log : [];
  snapshot.sync_log.push({
    sync_id: `products-${Date.now()}`,
    account_id: "product-kb",
    method: "manual",
    at: nowIso,
    status: "ok",
    message: `Product KB sync from ${file}: ${created} added, ${updated} updated.`,
    new_messages: 0
  });
  snapshot.sync_log = snapshot.sync_log.slice(-100);
  snapshot.generated_at = nowIso;
  recomputeMetrics(snapshot);
  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`Product KB synced: ${created} added, ${updated} updated (${snapshot.products.length} total) -> ${SNAPSHOT_PATH}`);
} finally {
  await fs.rm(LOCK_PATH, { force: true });
}
