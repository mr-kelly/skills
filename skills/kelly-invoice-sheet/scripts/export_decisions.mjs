#!/usr/bin/env node
// Trusted export step. Kelly Invoice Sheet's AirApp only ever writes a human
// decision (approve/request_changes/block/revise) plus edited field values
// onto an invoice record in Busabase — the browser cannot write to the local
// filesystem. This script is the process authorized to act on `approved`
// invoices: it re-reads Busabase, groups approved invoices by batch_id, and
// writes the exact same three files the retired scripts/export_decisions.ts
// wrote per batch (invoices.csv, line_items.csv, approved_invoices.json),
// then marks each exported invoice `done`.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-invoice-sheet-app/app/js/config.js";
import { computeInvoiceFromRow } from "../content/kelly-invoice-sheet-app/app/js/invoice-model.js";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/export_decisions.mjs [--apply] [--out <dir>]

Reads invoices with status "approved" from Busabase, grouped by batch_id.
Without --apply this is a dry run that only prints what would be exported.
With --apply it writes invoices.csv, line_items.csv, and
approved_invoices.json per batch to <out>/<batch-id>/ (default out:
exports/ at the skill root), then marks each exported invoice "done" in
Busabase.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

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

// Same column set as the retired scripts/export_decisions.ts.
const INVOICE_COLUMNS = [
  "id",
  "ref",
  "vendor_name",
  "vendor_tax_id",
  "invoice_number",
  "invoice_date",
  "due_date",
  "currency",
  "subtotal",
  "tax",
  "total",
  "amount_due",
  "payment_terms",
  "bill_to",
  "purchase_order",
  "source_file",
  "category",
  "confidence",
  "risk",
  "notes",
];

const LINE_COLUMNS = [
  "invoice_id",
  "invoice_number",
  "line_id",
  "description",
  "quantity",
  "unit_price",
  "amount",
  "tax_rate",
  "category",
  "confidence",
];

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf("--out");
  const outRoot = path.resolve(outIndex >= 0 ? argv[outIndex + 1] : path.join(SKILL_DIR, "exports"));

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Invoice Sheet Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const invoicesBase = resources.bases.find((base) => base.key === "invoices");
  const rows = await readAll(client, invoicesBase);
  const invoices = rows.map(computeInvoiceFromRow).filter((invoice) => invoice.status === "approved");

  const byBatch = new Map();
  for (const invoice of invoices) {
    const batchId = invoice.batch_id || "invoice-batch";
    if (!byBatch.has(batchId)) byBatch.set(batchId, []);
    byBatch.get(batchId).push(invoice);
  }

  const exported = [];
  for (const [batchId, batchInvoices] of byBatch) {
    const exportDir = path.join(outRoot, batchId);

    const invoiceRows = [
      INVOICE_COLUMNS.join(","),
      ...batchInvoices.map((invoice) =>
        INVOICE_COLUMNS.map((column) =>
          csvEscape(Array.isArray(invoice[column]) ? invoice[column].join("; ") : invoice[column]),
        ).join(","),
      ),
    ];

    const lineRows = [LINE_COLUMNS.join(",")];
    for (const invoice of batchInvoices) {
      for (const line of invoice.line_items) {
        const row = {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          line_id: line.line_id,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
          amount: line.amount,
          tax_rate: line.tax_rate,
          category: line.category,
          confidence: line.confidence,
        };
        lineRows.push(LINE_COLUMNS.map((column) => csvEscape(row[column])).join(","));
      }
    }

    const jsonPayload = {
      batch_id: batchId,
      exported_at: new Date().toISOString(),
      invoices: batchInvoices,
      line_items: batchInvoices.flatMap((invoice) =>
        invoice.line_items.map((line) => ({ ...line, invoice_id: invoice.id })),
      ),
    };

    if (apply) {
      await fs.mkdir(exportDir, { recursive: true });
      await fs.writeFile(path.join(exportDir, "invoices.csv"), `${invoiceRows.join("\n")}\n`);
      await fs.writeFile(path.join(exportDir, "line_items.csv"), `${lineRows.join("\n")}\n`);
      await fs.writeFile(path.join(exportDir, "approved_invoices.json"), `${JSON.stringify(jsonPayload, null, 2)}\n`);

      for (const invoice of batchInvoices) {
        const existing = rows.find((row) => row.invoice_id === invoice.id);
        if (!existing) continue;
        await client.records.changeRequest({
          recordId: existing.__recordId,
          operation: "update",
          fields: toBusabaseFields({ ...existing, status: "done" }),
          message: `Export invoice ${invoice.id}`,
          author: "kelly-invoice-sheet-exporter",
          baseCommitId: existing.__headCommitId,
          autoMerge: true,
        });
      }
    }

    exported.push({ batch_id: batchId, directory: exportDir, approved_count: batchInvoices.length });
  }

  console.log(
    JSON.stringify({ exported_at: new Date().toISOString(), dry_run: !apply, output_root: outRoot, exported }, null, 2),
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write the export files and mark invoices done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
