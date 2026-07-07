#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { csvEscape, nowIso } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import { mergeDecisions } from "../lib/invoice-schema.ts";
import { exportsDir } from "../lib/paths.ts";
import type { DecisionsFile, InvoiceBatch, InvoiceLineItem, InvoiceRecord } from "../lib/types.ts";

const provider = await createProvider();
const [rawBatch, rawDecisions, configResult] = await Promise.all([
  provider.readBatch(),
  provider.readDecisions(),
  provider.readConfig(),
]);
const batch = mergeDecisions(rawBatch as InvoiceBatch, rawDecisions as DecisionsFile);
const approved = batch.invoices.filter((invoice) => invoice.status === "approved");
const baseDir =
  configResult.config.export?.directory && !configResult.is_example
    ? configResult.config.export.directory.replace("<batch-id>", batch.batch_id)
    : path.join(exportsDir, batch.batch_id);
const exportDir = path.isAbsolute(baseDir) ? baseDir : path.resolve(process.cwd(), baseDir);
await fs.mkdir(exportDir, { recursive: true });

const invoiceColumns = [
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
] as const;

const invoiceRows = [
  invoiceColumns.join(","),
  ...approved.map((invoice) =>
    invoiceColumns
      .map((column) =>
        csvEscape(Array.isArray(invoice[column]) ? (invoice[column] as string[]).join("; ") : invoice[column]),
      )
      .join(","),
  ),
];
await fs.writeFile(path.join(exportDir, "invoices.csv"), `${invoiceRows.join("\n")}\n`);

const lineColumns = [
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
] as const;
const lineRows = [lineColumns.join(",")];
for (const invoice of approved) {
  for (const line of invoice.line_items) {
    const row: Record<(typeof lineColumns)[number], unknown> = {
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
    lineRows.push(lineColumns.map((column) => csvEscape(row[column])).join(","));
  }
}
await fs.writeFile(path.join(exportDir, "line_items.csv"), `${lineRows.join("\n")}\n`);

const jsonPayload: { batch_id: string; exported_at: string; invoices: InvoiceRecord[]; line_items: InvoiceLineItem[] } =
  {
    batch_id: batch.batch_id,
    exported_at: nowIso(),
    invoices: approved,
    line_items: approved.flatMap((invoice) =>
      invoice.line_items.map((line) => ({ ...line, invoice_id: invoice.id }) as InvoiceLineItem),
    ),
  };
await fs.writeFile(path.join(exportDir, "approved_invoices.json"), `${JSON.stringify(jsonPayload, null, 2)}\n`);

const report = {
  schema_version: "1",
  batch_id: batch.batch_id,
  exported_at: nowIso(),
  operation: "export_approved_invoices",
  target_directory: exportDir,
  approved_count: approved.length,
  skipped_count: batch.invoices.length - approved.length,
  files: ["invoices.csv", "line_items.csv", "approved_invoices.json"],
};
await provider.writeExecutionReport(report);
console.log(`Exported ${approved.length} approved invoices to ${exportDir}`);
