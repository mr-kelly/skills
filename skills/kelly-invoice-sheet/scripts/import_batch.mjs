#!/usr/bin/env node
// Trusted ingestion step. Kelly Invoice Sheet's AirApp is read/decision-only
// (it only ever writes decision_action/decision_note/decided_at plus a human
// field edit onto an existing invoice record) — it never extracts invoice
// data itself, since the browser cannot call OCR/document-parsing tools or
// read an arbitrary local file path. This script is the trusted process the
// skill workflow runs after extraction: it reads a batch JSON file matching
// the retired lib/types.ts InvoiceBatch shape (or a bare array of invoice
// objects), validates it with validateInvoicesShape() (ported verbatim from
// the retired lib/invoice-schema.ts's validateBatchShape(), see
// content/kelly-invoice-sheet-app/app/js/invoice-model.js), and upserts each invoice as a Busabase
// `invoices` record (keyed by invoice-id, so re-running the same batch after
// a correction updates the existing rows instead of duplicating them).
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run), the same convention as
// kelly-writer's generate_batch.mjs and kelly-family-fund's importer.
import fs from "node:fs/promises";
import path from "node:path";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-invoice-sheet-app/app/js/config.js";
import { baseInvoiceFields, validateInvoicesShape } from "../content/kelly-invoice-sheet-app/app/js/invoice-model.js";

function help() {
  console.log(`Usage: node scripts/import_batch.mjs --file <batch.json> [--batch-id <id>] [--apply]

Reads an invoice extraction batch (an object with an "invoices" array, or a
bare array of invoice objects) matching references/invoice-batch-schema.md,
validates it, and upserts each invoice into Busabase's "invoices" Base
(matched by invoice-id, so re-running the same batch after a correction
updates existing rows instead of duplicating them).

Options:
  --file <path>       Path to the batch JSON file (required)
  --batch-id <id>      Batch id to stamp on every invoice if the batch/invoice
                        does not already carry one (default: invoice-<timestamp>)
  --apply              Write to Busabase (default is a dry run that only
                        validates and prints what would be written)`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (part.startsWith("--")) {
      const key = part.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(part);
    }
  }
  return out;
}

function isoStamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").slice(0, 14);
}

const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function findRecord(client, declared, idValue) {
  try {
    return await client.records.get({ baseId: declared.baseId, fieldSlug: "invoice-id", valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) return help();
  const apply = Boolean(args.apply);
  const filePath = args.file || args._[0];
  if (!filePath) {
    help();
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
  const invoices = Array.isArray(raw) ? raw : Array.isArray(raw.invoices) ? raw.invoices : [];
  const defaultBatchId = args["batch-id"] || raw.batch_id || `invoice-${isoStamp()}`;

  const validation = validateInvoicesShape(invoices);
  if (!validation.ok) {
    console.error("Batch failed validation:");
    for (const error of validation.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);

  console.log(`Validated ${invoices.length} invoice(s) for batch ${defaultBatchId}.`);
  if (!apply) {
    console.log("Dry run (pass --apply to write to Busabase):");
    for (const invoice of invoices) {
      console.log(`  ${invoice.id.padEnd(14)} ${invoice.vendor_name} · ${invoice.invoice_number} · ${invoice.total}`);
    }
    return;
  }

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required with --apply");
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

  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();
  for (const invoice of invoices) {
    const fields = toBusabaseFields(
      baseInvoiceFields({
        ...invoice,
        batch_id: invoice.batch_id || defaultBatchId,
        created_at: invoice.created_at || now,
      }),
    );
    const existing = await findRecord(client, invoicesBase, invoice.id);
    if (existing) {
      await client.records.changeRequest({
        recordId: existing.id,
        operation: "update",
        fields,
        message: `Update invoice ${invoice.id} from batch ${defaultBatchId}`,
        author: "kelly-invoice-sheet-importer",
        baseCommitId: existing.headCommitId,
        autoMerge: true,
      });
      updated += 1;
    } else {
      await client.bases.createChangeRequest({
        baseId: invoicesBase.baseId,
        fields,
        message: `Add invoice ${invoice.id} from batch ${defaultBatchId}`,
        submittedBy: "kelly-invoice-sheet-importer",
        autoMerge: true,
      });
      created += 1;
    }
  }

  console.log(`Wrote batch ${defaultBatchId} to Busabase: ${created} created, ${updated} updated.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
