#!/usr/bin/env node
import { nowIso, writeJson } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import { recomputeMetrics } from "../lib/invoice-schema.ts";
import { agentTasksPath, decisionsPath, executionReportPath } from "../lib/paths.ts";
import type { InvoiceBatch } from "../lib/types.ts";

const generatedAt = new Date().toISOString();
const batchId = `invoice-demo-${generatedAt.replace(/[-:]/g, "").slice(0, 15)}`;

const demoBatch: InvoiceBatch = recomputeMetrics({
  schema_version: "1",
  batch_id: batchId,
  generated_at: generatedAt,
  source: "kelly-invoice-sheet",
  mode: "app-in-skill",
  extractor: {
    name: "demo-fixture",
    notes:
      "Synthetic invoice extraction examples for UI testing. Replace with agent/OCR-generated batch data for real work.",
  },
  input_files: [
    { path: "samples/acme-hosting-june.pdf", name: "acme-hosting-june.pdf", type: "pdf", pages: 1 },
    { path: "samples/studio-rent-receipt.jpg", name: "studio-rent-receipt.jpg", type: "image", pages: 1 },
    { path: "samples/supplier-credit-note.pdf", name: "supplier-credit-note.pdf", type: "pdf", pages: 2 },
  ],
  metrics: {
    total: 0,
    needs_review: 0,
    changes_requested: 0,
    approved: 0,
    done: 0,
    blocked: 0,
    low_confidence: 0,
    total_amount: 0,
    currencies: [],
  },
  invoices: [
    {
      id: "inv-001",
      ref: "Review #1",
      title: "Acme Cloud hosting invoice",
      status: "needs_review",
      category: "vendor_invoice",
      source_file: "acme-hosting-june.pdf",
      source_path: "samples/acme-hosting-june.pdf",
      source_type: "pdf",
      source_page: 1,
      vendor_name: "Acme Cloud Services",
      vendor_tax_id: "US-93-1048201",
      invoice_number: "AC-2026-0618",
      invoice_date: "2026-06-30",
      due_date: "2026-07-15",
      currency: "USD",
      subtotal: 1260,
      tax: 100.8,
      total: 1360.8,
      amount_due: 1360.8,
      payment_terms: "Net 15",
      bill_to: "Kelly Labs",
      purchase_order: "PO-5521",
      confidence: 0.94,
      field_confidence: {
        vendor_name: { confidence: 0.98, source_text: "Acme Cloud Services" },
        invoice_number: { confidence: 0.95, source_text: "Invoice # AC-2026-0618" },
        total: { confidence: 0.96, source_text: "Total Due USD 1,360.80" },
      },
      risk: [],
      warnings: [],
      notes: "",
      line_items: [
        {
          line_id: "inv-001-line-1",
          description: "Cloud compute reserved instances",
          quantity: 12,
          unit_price: 80,
          amount: 960,
          confidence: 0.93,
        },
        {
          line_id: "inv-001-line-2",
          description: "Managed database backup storage",
          quantity: 1,
          unit_price: 300,
          amount: 300,
          confidence: 0.91,
        },
      ],
      proposed_action: "export_after_review",
      reason: "Core invoice fields and totals are high confidence.",
    },
    {
      id: "inv-002",
      ref: "Review #2",
      title: "Studio rent receipt",
      status: "needs_review",
      category: "receipt",
      source_file: "studio-rent-receipt.jpg",
      source_path: "samples/studio-rent-receipt.jpg",
      source_type: "image",
      source_page: 1,
      vendor_name: "North Pier Studio",
      invoice_number: "R-88421",
      invoice_date: "2026-06-01",
      currency: "USD",
      subtotal: 2400,
      tax: 0,
      total: 2400,
      amount_due: 0,
      payment_terms: "Paid by ACH",
      bill_to: "Kelly Labs",
      confidence: 0.79,
      field_confidence: {
        invoice_number: { confidence: 0.72, source_text: "R-884?1" },
        total: { confidence: 0.9, source_text: "$2,400.00" },
      },
      risk: ["low_confidence"],
      warnings: ["Receipt number has one ambiguous digit; confirm before export."],
      notes: "",
      line_items: [
        {
          line_id: "inv-002-line-1",
          description: "Studio rental - June 2026",
          quantity: 1,
          unit_price: 2400,
          amount: 2400,
          confidence: 0.84,
        },
      ],
      proposed_action: "human_confirm",
      reason: "One key field is below the review threshold.",
    },
    {
      id: "inv-003",
      ref: "Review #3",
      title: "Packaging supplier credit note",
      status: "blocked",
      category: "credit_note",
      source_file: "supplier-credit-note.pdf",
      source_path: "samples/supplier-credit-note.pdf",
      source_type: "pdf",
      source_page: 2,
      vendor_name: "GreenPack Supply Co.",
      invoice_number: "CN-2026-118",
      invoice_date: "2026-06-24",
      currency: "USD",
      subtotal: -418,
      tax: -33.44,
      total: -451.44,
      amount_due: -451.44,
      bill_to: "Kelly Labs",
      confidence: 0.88,
      risk: ["credit_note", "missing_original_invoice"],
      warnings: ["Original invoice reference was not found in the source file."],
      notes: "Needs original invoice number before bookkeeping import.",
      line_items: [
        {
          line_id: "inv-003-line-1",
          description: "Returned mailer cartons",
          quantity: 200,
          unit_price: -2.09,
          amount: -418,
          confidence: 0.88,
        },
      ],
      proposed_action: "block_until_reference",
      reason: "Credit notes should carry original invoice references for reconciliation.",
    },
  ],
});

const provider = await createProvider();
await provider.writeBatch(demoBatch);
await provider.completeOnboarding({ completed_by: "demo-generator" });
await writeJson(decisionsPath, { schema_version: "1", updated_at: nowIso(), decisions: {} });
await writeJson(agentTasksPath, { schema_version: "1", updated_at: nowIso(), tasks: [] });
await writeJson(executionReportPath, {
  schema_version: "1",
  batch_id: batchId,
  generated_at: nowIso(),
  operation: "demo_reset",
  result: "no approved invoices exported",
});
console.log(`Wrote demo invoice batch: ${batchId}`);
