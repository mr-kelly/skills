#!/usr/bin/env node
// Import/normalize orders, invoices, and payments (回款) from CSV or JSON
// exports into app/.data/audit_snapshot.json. This is the write path of the
// kelly-audit skill: it parses local files only, applies the column mapping
// from private config, upserts by natural key, recomputes derived statuses
// and metrics, and appends an import_log entry. Honors app/.data/agent.lock.
//
// Usage:
//   node scripts/import_tables.mjs --orders orders.csv --invoices invoices.csv --payments payments.csv
//
// Any subset of the three tables may be given. CSV needs a header row; JSON
// must be an array of objects. Column mapping (canonical -> source header)
// comes from config `import.<table>.columns`; unmapped canonical names fall
// back to identical header names.

import fs from "node:fs/promises";
import path from "node:path";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.mjs";
import {
  emptySnapshot,
  ensureDirs,
  envSearchPaths,
  loadDotenvFiles,
  readConfig,
  readJson,
  readLock,
  writeJson
} from "../app/server/store.mjs";
import { DEFAULT_RULES, dateOnly, deriveSnapshot } from "../app/server/compute.mjs";

const CANONICAL_COLUMNS = {
  orders: ["order_no", "customer", "order_date", "amount", "currency"],
  invoices: ["invoice_no", "order_no", "customer", "issue_date", "due_date", "amount", "currency", "kind"],
  payments: ["payment_ref", "invoice_no", "order_no", "payer", "paid_date", "amount", "currency", "method"]
};

function fail(message) {
  console.error(`kelly-audit import: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--orders" || key === "--invoices" || key === "--payments") {
      args[key.slice(2)] = argv[i + 1] || "";
      i += 1;
    } else if (key === "--help" || key === "-h") {
      args.help = true;
    } else {
      fail(`Unknown argument: ${key}`);
    }
  }
  return args;
}

// Minimal CSV parser: handles quoted fields, embedded commas, escaped quotes
// ("") and CRLF line endings. No external dependencies.
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
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function csvToRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

async function readRecords(file) {
  const raw = await fs.readFile(file, "utf8").catch((error) => fail(`cannot read ${file}: ${error.message}`));
  if (file.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) fail(`${file}: JSON import must be an array of objects`);
    return parsed;
  }
  return csvToRecords(raw);
}

function normalizeAmount(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : NaN;
}

function slugId(prefix, value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `${prefix}-unknown`;
}

function mapRecord(record, table, mapping) {
  const out = {};
  for (const canonical of CANONICAL_COLUMNS[table]) {
    const source = mapping?.[canonical] || canonical;
    out[canonical] = record[source] ?? record[canonical] ?? "";
  }
  return out;
}

function normalizeOrder(raw, baseCurrency, sourceFile, warnings, index) {
  if (!raw.order_no) {
    warnings.push(`orders row ${index + 1}: missing order_no, skipped.`);
    return null;
  }
  const amount = normalizeAmount(raw.amount);
  if (!Number.isFinite(amount)) {
    warnings.push(`orders row ${index + 1} (${raw.order_no}): unreadable amount "${raw.amount}", skipped.`);
    return null;
  }
  return {
    order_id: slugId("so", raw.order_no),
    order_no: String(raw.order_no).trim(),
    customer: String(raw.customer || "").trim(),
    order_date: dateOnly(raw.order_date),
    amount,
    currency: String(raw.currency || baseCurrency).trim().toUpperCase(),
    source_file: sourceFile
  };
}

function normalizeInvoice(raw, baseCurrency, sourceFile, warnings, index) {
  if (!raw.invoice_no) {
    warnings.push(`invoices row ${index + 1}: missing invoice_no, skipped.`);
    return null;
  }
  const amount = normalizeAmount(raw.amount);
  if (!Number.isFinite(amount)) {
    warnings.push(`invoices row ${index + 1} (${raw.invoice_no}): unreadable amount "${raw.amount}", skipped.`);
    return null;
  }
  const kind = String(raw.kind || "").trim().toLowerCase() === "credit_note" || amount < 0 ? "credit_note" : "invoice";
  return {
    invoice_id: slugId("inv", raw.invoice_no),
    invoice_no: String(raw.invoice_no).trim(),
    order_no: String(raw.order_no || "").trim(),
    customer: String(raw.customer || "").trim(),
    issue_date: dateOnly(raw.issue_date),
    due_date: dateOnly(raw.due_date),
    amount,
    currency: String(raw.currency || baseCurrency).trim().toUpperCase(),
    kind,
    notes: "",
    source_file: sourceFile
  };
}

function normalizePayment(raw, baseCurrency, sourceFile, warnings, index) {
  if (!raw.payment_ref) {
    warnings.push(`payments row ${index + 1}: missing payment_ref, skipped.`);
    return null;
  }
  const amount = normalizeAmount(raw.amount);
  if (!Number.isFinite(amount)) {
    warnings.push(`payments row ${index + 1} (${raw.payment_ref}): unreadable amount "${raw.amount}", skipped.`);
    return null;
  }
  return {
    payment_id: slugId("rcp", raw.payment_ref),
    payment_ref: String(raw.payment_ref).trim(),
    invoice_no: String(raw.invoice_no || "").trim(),
    order_no: String(raw.order_no || "").trim(),
    payer: String(raw.payer || "").trim(),
    paid_date: dateOnly(raw.paid_date),
    amount,
    currency: String(raw.currency || baseCurrency).trim().toUpperCase(),
    method: String(raw.method || "other").trim().toLowerCase() || "other",
    source_file: sourceFile
  };
}

function upsert(list, incoming, key) {
  let added = 0;
  let updated = 0;
  const byKey = new Map(list.map((item) => [item[key], item]));
  for (const item of incoming) {
    const existing = byKey.get(item[key]);
    if (existing) {
      Object.assign(existing, item);
      updated += 1;
    } else {
      list.push(item);
      byKey.set(item[key], item);
      added += 1;
    }
  }
  return { added, updated };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.orders && !args.invoices && !args.payments)) {
    console.log("Usage: node scripts/import_tables.mjs [--orders file.csv|.json] [--invoices file.csv|.json] [--payments file.csv|.json]");
    process.exit(args.help ? 0 : 1);
  }

  await ensureDirs();
  await loadDotenvFiles(envSearchPaths());
  const existingLock = await readLock();
  if (existingLock) {
    fail(`agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`);
  }

  const configResult = await readConfig();
  const config = configResult.config || {};
  const rules = { ...DEFAULT_RULES, ...(config.rules || {}) };
  const baseCurrency = config.base_currency || "USD";
  const importCfg = config.import || {};

  await writeJson(LOCK_PATH, {
    owner: "kelly-audit",
    message: "Importing orders/invoices/payments tables",
    started_at: new Date().toISOString()
  });

  try {
    const snapshot = (await readJson(SNAPSHOT_PATH, null)) || emptySnapshot();
    snapshot.base_currency = baseCurrency;
    snapshot.fx_rates = config.fx_rates || snapshot.fx_rates || {};
    snapshot.company = { name: config.company?.name || snapshot.company?.name || "" };
    snapshot.orders = snapshot.orders || [];
    snapshot.invoices = snapshot.invoices || [];
    snapshot.payments = snapshot.payments || [];
    snapshot.anomalies = snapshot.anomalies || [];
    snapshot.import_log = snapshot.import_log || [];

    const warnings = [];
    const added = { orders: 0, invoices: 0, payments: 0 };
    const updated = { orders: 0, invoices: 0, payments: 0 };
    const files = {};

    if (args.orders) {
      const records = await readRecords(args.orders);
      const normalized = records
        .map((record, index) => normalizeOrder(mapRecord(record, "orders", importCfg.orders?.columns), baseCurrency, path.basename(args.orders), warnings, index))
        .filter(Boolean);
      const result = upsert(snapshot.orders, normalized, "order_no");
      added.orders = result.added;
      updated.orders = result.updated;
      files.orders = args.orders;
    }
    if (args.invoices) {
      const records = await readRecords(args.invoices);
      const normalized = records
        .map((record, index) => normalizeInvoice(mapRecord(record, "invoices", importCfg.invoices?.columns), baseCurrency, path.basename(args.invoices), warnings, index))
        .filter(Boolean);
      const result = upsert(snapshot.invoices, normalized, "invoice_no");
      added.invoices = result.added;
      updated.invoices = result.updated;
      files.invoices = args.invoices;
    }
    if (args.payments) {
      const records = await readRecords(args.payments);
      const normalized = records
        .map((record, index) => normalizePayment(mapRecord(record, "payments", importCfg.payments?.columns), baseCurrency, path.basename(args.payments), warnings, index))
        .filter(Boolean);
      const result = upsert(snapshot.payments, normalized, "payment_ref");
      added.payments = result.added;
      updated.payments = result.updated;
      files.payments = args.payments;
    }

    const now = new Date().toISOString();
    deriveSnapshot(snapshot, rules, now);
    for (const payment of snapshot.payments) {
      if (payment.match_status === "unmatched" && payment.invoice_no) {
        const warning = `Payment ${payment.payment_ref} references unknown invoice ${payment.invoice_no}.`;
        if (!warnings.includes(warning)) warnings.push(warning);
      }
    }

    const orderDates = snapshot.orders.map((order) => order.order_date).filter(Boolean).sort();
    snapshot.range = { start: orderDates[0] || "", end: orderDates[orderDates.length - 1] || "" };
    snapshot.generated_at = now;
    snapshot.source = "kelly-audit";
    snapshot.schema_version = "1";
    snapshot.warnings = [];
    snapshot.import_log.unshift({
      import_id: `imp-${now.replace(/[-:TZ.]/g, "").slice(0, 12)}`,
      imported_at: now,
      files,
      added,
      updated,
      warnings
    });
    snapshot.import_log = snapshot.import_log.slice(0, 20);

    await writeJson(SNAPSHOT_PATH, snapshot);
    console.log(`Wrote ${SNAPSHOT_PATH}`);
    console.log(`  orders: +${added.orders} added, ${updated.orders} updated (total ${snapshot.orders.length})`);
    console.log(`  invoices: +${added.invoices} added, ${updated.invoices} updated (total ${snapshot.invoices.length})`);
    console.log(`  payments: +${added.payments} added, ${updated.payments} updated (total ${snapshot.payments.length})`);
    for (const warning of warnings) console.log(`  warning: ${warning}`);
    console.log("Next: node scripts/run_checks.mjs to refresh the anomaly queue.");
  } finally {
    await fs.rm(LOCK_PATH, { force: true });
  }
}

await main();
