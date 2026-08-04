#!/usr/bin/env node
// Trusted hand-off step. Kelly Audit's AirApp never imports business
// documents itself — the browser cannot read an arbitrary local file path.
// This script parses local CSV/JSON exports, applies the column mapping
// from the Settings row, normalizes dates/amounts/currencies, and upserts
// orders/invoices/payments into Busabase by natural key (order_no /
// invoice_no / payment_ref) so re-imports are idempotent. It appends an
// entry to the Import Log Base with per-file added/updated counts and row
// warnings. It performs no other external effect.
//
// normalizeAmount/slugId/parseCsv/csvToRecords/mapRecord/normalizeOrder/
// normalizeInvoice/normalizePayment are ported verbatim from the retired
// scripts/import_tables.ts; only the write target changed, from a
// persisted app/.data/audit_snapshot.json to Busabase's orders/invoices/
// payments/import_log Bases (derived statuses/matches/aging are no longer
// written at import time — the AirApp/scripts compute them at read time via
// app/app/js/audit-model.js's deriveSnapshot(), so this importer only needs
// to write the raw normalized rows).
//
// Usage:
//   node scripts/import_tables.mjs --orders orders.csv --invoices invoices.csv --payments payments.csv [--apply]
//
// Any subset of the three tables may be given. Without --apply this is a
// dry run that only prints what would be written.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

const CANONICAL_COLUMNS = {
  orders: ["order_no", "customer", "order_date", "amount", "currency"],
  invoices: ["invoice_no", "order_no", "customer", "issue_date", "due_date", "amount", "currency", "kind"],
  payments: ["payment_ref", "invoice_no", "order_no", "payer", "paid_date", "amount", "currency", "method"],
};

function help() {
  console.log(`Usage: node scripts/import_tables.mjs [--orders file.csv|.json] [--invoices file.csv|.json] [--payments file.csv|.json] [--apply]

Parses local CSV/JSON exports, applies the column mapping from the Settings
row, normalizes rows, and upserts orders/invoices/payments into Busabase by
natural key (order_no / invoice_no / payment_ref). Appends an entry to the
Import Log Base. Without --apply this is a dry run that only prints what
would be written.`);
}

/** @returns {never} */
function fail(message) {
  console.error(`kelly-audit import: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--orders" || key === "--invoices" || key === "--payments") {
      args[key.slice(2)] = argv[i + 1] || "";
      i += 1;
    } else if (key === "--apply") {
      args.apply = true;
    } else if (key === "--help" || key === "-h") {
      args.help = true;
    } else {
      fail(`Unknown argument: ${key}`);
    }
  }
  return args;
}

// ---- Ported verbatim from the retired scripts/import_tables.ts ----

function dateOnly(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

// Minimal CSV parser: handles quoted fields, embedded commas, escaped quotes
// ("") and CRLF line endings. No external dependencies.
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
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function slugId(prefix, value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    currency: String(raw.currency || baseCurrency)
      .trim()
      .toUpperCase(),
    source_file: sourceFile,
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
  const kind =
    String(raw.kind || "")
      .trim()
      .toLowerCase() === "credit_note" || amount < 0
      ? "credit_note"
      : "invoice";
  return {
    invoice_id: slugId("inv", raw.invoice_no),
    invoice_no: String(raw.invoice_no).trim(),
    order_no: String(raw.order_no || "").trim(),
    customer: String(raw.customer || "").trim(),
    issue_date: dateOnly(raw.issue_date),
    due_date: dateOnly(raw.due_date),
    amount,
    currency: String(raw.currency || baseCurrency)
      .trim()
      .toUpperCase(),
    kind,
    notes: "",
    source_file: sourceFile,
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
    currency: String(raw.currency || baseCurrency)
      .trim()
      .toUpperCase(),
    method:
      String(raw.method || "other")
        .trim()
        .toLowerCase() || "other",
    source_file: sourceFile,
  };
}

// ---- Busabase plumbing (new: replaces the retired local-file provider) ----

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

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

async function upsertRow(client, declared, existingByKey, keyValue, fields, message, apply) {
  const existing = existingByKey.get(keyValue);
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-audit-import",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-audit-import",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.orders && !args.invoices && !args.payments)) return help();
  const apply = Boolean(args.apply);

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Audit Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [existingOrders, existingInvoices, existingPayments, settingsRows] = await Promise.all([
    readAll(client, declared("orders")),
    readAll(client, declared("invoices")),
    readAll(client, declared("payments")),
    readAll(client, declared("settings")),
  ]);
  /** @type {Record<string, any>} */
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const baseCurrency = settings.base_currency || "USD";
  const parseColumns = (value) => {
    try {
      return value ? JSON.parse(value) : {};
    } catch {
      return {};
    }
  };
  const importCfg = {
    orders: { columns: parseColumns(settings.import_orders_columns) },
    invoices: { columns: parseColumns(settings.import_invoices_columns) },
    payments: { columns: parseColumns(settings.import_payments_columns) },
  };

  const warnings = [];
  const added = { orders: 0, invoices: 0, payments: 0 };
  const updated = { orders: 0, invoices: 0, payments: 0 };
  const files = {};

  const ordersByNo = new Map(existingOrders.map((row) => [row.order_no, row]));
  const invoicesByNo = new Map(existingInvoices.map((row) => [row.invoice_no, row]));
  const paymentsByRef = new Map(existingPayments.map((row) => [row.payment_ref, row]));

  let normalizedInvoices = existingInvoices.map((row) => row.invoice_no);

  if (args.orders) {
    const records = await readRecords(args.orders);
    const normalized = records
      .map((record, index) =>
        normalizeOrder(
          mapRecord(record, "orders", importCfg.orders.columns),
          baseCurrency,
          path.basename(args.orders),
          warnings,
          index,
        ),
      )
      .filter((item) => item !== null);
    for (const fields of normalized) {
      const outcome = await upsertRow(
        client,
        declared("orders"),
        ordersByNo,
        fields.order_no,
        fields,
        `Import order ${fields.order_no}`,
        apply,
      );
      if (outcome === "created" || outcome === "would_create") added.orders += 1;
      else updated.orders += 1;
    }
    files.orders = args.orders;
  }
  if (args.invoices) {
    const records = await readRecords(args.invoices);
    const normalized = records
      .map((record, index) =>
        normalizeInvoice(
          mapRecord(record, "invoices", importCfg.invoices.columns),
          baseCurrency,
          path.basename(args.invoices),
          warnings,
          index,
        ),
      )
      .filter((item) => item !== null);
    normalizedInvoices = [...normalizedInvoices, ...normalized.map((item) => item.invoice_no)];
    for (const fields of normalized) {
      const outcome = await upsertRow(
        client,
        declared("invoices"),
        invoicesByNo,
        fields.invoice_no,
        fields,
        `Import invoice ${fields.invoice_no}`,
        apply,
      );
      if (outcome === "created" || outcome === "would_create") added.invoices += 1;
      else updated.invoices += 1;
    }
    files.invoices = args.invoices;
  }
  if (args.payments) {
    const records = await readRecords(args.payments);
    const normalized = records
      .map((record, index) =>
        normalizePayment(
          mapRecord(record, "payments", importCfg.payments.columns),
          baseCurrency,
          path.basename(args.payments),
          warnings,
          index,
        ),
      )
      .filter((item) => item !== null);
    const invoiceNoSet = new Set(normalizedInvoices.filter(Boolean));
    for (const fields of normalized) {
      const outcome = await upsertRow(
        client,
        declared("payments"),
        paymentsByRef,
        fields.payment_ref,
        fields,
        `Import payment ${fields.payment_ref}`,
        apply,
      );
      if (outcome === "created" || outcome === "would_create") added.payments += 1;
      else updated.payments += 1;
      if (fields.invoice_no && !invoiceNoSet.has(fields.invoice_no)) {
        const warning = `Payment ${fields.payment_ref} references unknown invoice ${fields.invoice_no}.`;
        if (!warnings.includes(warning)) warnings.push(warning);
      }
    }
    files.payments = args.payments;
  }

  const now = new Date().toISOString();
  const logId = `imp-${now.replace(/[-:TZ.]/g, "").slice(0, 12)}`;
  if (apply) {
    await client.bases.createChangeRequest({
      baseId: declared("import_log").baseId,
      fields: toBusabaseFields({
        log_id: logId,
        imported_at: now,
        files: JSON.stringify(files),
        added: JSON.stringify(added),
        updated: JSON.stringify(updated),
        warnings: JSON.stringify(warnings),
      }),
      message: `Import log ${logId}`,
      submittedBy: "kelly-audit-import",
      autoMerge: true,
    });
  }

  console.log(`${apply ? "Wrote" : "Dry run for"} the Busabase orders/invoices/payments Bases`);
  console.log(`  orders: +${added.orders} added, ${updated.orders} updated`);
  console.log(`  invoices: +${added.invoices} added, ${updated.invoices} updated`);
  console.log(`  payments: +${added.payments} added, ${updated.payments} updated`);
  for (const warning of warnings) console.log(`  warning: ${warning}`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
  else console.log("Next: node scripts/run_checks.mjs to refresh the anomaly queue.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
