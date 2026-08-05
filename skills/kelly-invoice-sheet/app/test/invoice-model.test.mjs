import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDecisionToInvoice,
  assembleBatch,
  baseInvoiceFields,
  buildConfigSummary,
  computeInvoiceFromRow,
  decisionStatusFor,
  demoInvoices,
  normalizeInvoicePatch,
  recomputeMetrics,
  validateInvoicesShape,
} from "../app/js/invoice-model.js";

test("decisionStatusFor maps every decision verdict", () => {
  assert.equal(decisionStatusFor("approve"), "approved");
  assert.equal(decisionStatusFor("request_changes"), "changes_requested");
  assert.equal(decisionStatusFor("block"), "blocked");
  assert.equal(decisionStatusFor("revise"), null);
  assert.equal(decisionStatusFor("unknown"), null);
});

test("normalizeInvoicePatch drops unknown fields and coerces numbers", () => {
  const patch = normalizeInvoicePatch({
    vendor_name: "Acme",
    total: "1360.8",
    subtotal: 1260,
    not_allowed: "nope",
    risk: ["low_confidence", 5],
    line_items: [{ description: "Item", amount: 10 }, { description: "" }],
  });
  assert.equal(patch.vendor_name, "Acme");
  assert.equal(patch.total, undefined); // "1360.8" is a string, not a finite number
  assert.equal(patch.subtotal, 1260);
  assert.equal(patch.not_allowed, undefined);
  assert.deepEqual(patch.risk, ["low_confidence"]);
  assert.equal(patch.line_items.length, 1);
  assert.equal(patch.line_items[0].description, "Item");
});

test("applyDecisionToInvoice sets status from the decision action", () => {
  const invoice = { id: "inv-1", status: "needs_review", line_items: [] };
  const approved = applyDecisionToInvoice(invoice, { action: "approve", patch: {} });
  assert.equal(approved.status, "approved");
  const blocked = applyDecisionToInvoice(invoice, { action: "block", patch: {} });
  assert.equal(blocked.status, "blocked");
  const requested = applyDecisionToInvoice(invoice, { action: "request_changes", patch: {} });
  assert.equal(requested.status, "changes_requested");
  const revisedFromDone = applyDecisionToInvoice({ ...invoice, status: "done" }, { action: "revise", patch: {} });
  assert.equal(revisedFromDone.status, "needs_review");
  assert.equal(applyDecisionToInvoice(invoice, undefined), invoice);
});

test("recomputeMetrics counts statuses, low confidence, totals, and currencies", () => {
  const metrics = recomputeMetrics(
    [
      { status: "needs_review", confidence: 0.5, total: 100, currency: "USD" },
      { status: "approved", confidence: 0.95, total: 200, currency: "EUR" },
      { status: "approved", confidence: 0.6, total: 50, currency: "USD" },
    ],
    0.82,
  );
  assert.equal(metrics.total, 3);
  assert.equal(metrics.needs_review, 1);
  assert.equal(metrics.approved, 2);
  assert.equal(metrics.low_confidence, 2);
  assert.equal(metrics.total_amount, 350);
  assert.deepEqual(metrics.currencies, ["EUR", "USD"]);
});

test("validateInvoicesShape requires core fields and flags duplicates", () => {
  const result = validateInvoicesShape([
    {
      id: "inv-1",
      ref: "Review #1",
      title: "T",
      status: "needs_review",
      category: "vendor_invoice",
      source_file: "a.pdf",
      vendor_name: "Acme",
      invoice_number: "1",
      invoice_date: "2026-01-01",
      currency: "USD",
      total: 100,
      confidence: 0.9,
      line_items: [],
    },
    {
      id: "inv-1",
      ref: "Review #2",
      title: "",
      status: "invalid_status",
      category: "vendor_invoice",
      source_file: "b.pdf",
      vendor_name: "",
      invoice_number: "2",
      invoice_date: "2026-01-02",
      currency: "USD",
      total: Number.NaN,
      confidence: 2,
      line_items: [],
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate invoice id "inv-1"')));
  assert.ok(result.errors.some((error) => error.includes("title is required")));
  assert.ok(result.errors.some((error) => error.includes("status is invalid")));
  assert.ok(result.errors.some((error) => error.includes("total must be a number")));
  assert.ok(result.errors.some((error) => error.includes("confidence must be between 0 and 1")));
});

test("validateInvoicesShape warns (not errors) on missing line items", () => {
  const result = validateInvoicesShape([
    {
      id: "inv-1",
      ref: "Review #1",
      title: "T",
      status: "needs_review",
      category: "vendor_invoice",
      source_file: "a.pdf",
      vendor_name: "Acme",
      invoice_number: "1",
      invoice_date: "2026-01-01",
      currency: "USD",
      total: 100,
      confidence: 0.9,
      line_items: [],
    },
  ]);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((warning) => warning.includes("no line items")));
});

test("baseInvoiceFields JSON-encodes array/object fields and defaults every parameter", () => {
  const fields = baseInvoiceFields();
  assert.equal(fields.invoice_id, "");
  assert.equal(fields.status, "needs_review");
  assert.equal(fields.field_confidence, "{}");
  assert.equal(fields.risk, "[]");
  assert.equal(fields.line_items, "[]");

  const withData = baseInvoiceFields({
    id: "inv-1",
    field_confidence: { total: { confidence: 0.9 } },
    risk: ["low_confidence"],
    line_items: [{ line_id: "l-1", description: "Item", amount: 10 }],
  });
  assert.equal(withData.invoice_id, "inv-1");
  assert.deepEqual(JSON.parse(withData.field_confidence), { total: { confidence: 0.9 } });
  assert.deepEqual(JSON.parse(withData.risk), ["low_confidence"]);
  assert.deepEqual(JSON.parse(withData.line_items), [{ line_id: "l-1", description: "Item", amount: 10 }]);
});

test("computeInvoiceFromRow parses JSON fields back and reassembles decision", () => {
  const row = baseInvoiceFields({
    id: "inv-1",
    ref: "Review #1",
    vendor_name: "Acme",
    risk: ["low_confidence"],
    line_items: [{ line_id: "l-1", description: "Item", amount: 10 }],
    decision_action: "approve",
    decision_note: "looks good",
    decided_at: "2026-06-30T00:00:00.000Z",
  });
  const invoice = computeInvoiceFromRow(row);
  assert.equal(invoice.id, "inv-1");
  assert.equal(invoice.vendor_name, "Acme");
  assert.deepEqual(invoice.risk, ["low_confidence"]);
  assert.equal(invoice.line_items[0].description, "Item");
  assert.deepEqual(invoice.decision, {
    action: "approve",
    comment: "looks good",
    decided_at: "2026-06-30T00:00:00.000Z",
  });
});

test("computeInvoiceFromRow never throws when called with no argument", () => {
  const invoice = computeInvoiceFromRow();
  assert.equal(invoice.id, "");
  assert.equal(invoice.status, "needs_review");
  assert.equal(invoice.decision, undefined);
});

test("assembleBatch sorts invoices by created_at and recomputes metrics", () => {
  const batch = assembleBatch({
    invoices: [
      { id: "inv-2", status: "approved", confidence: 0.9, total: 10, currency: "USD", created_at: "2026-02-01" },
      { id: "inv-1", status: "needs_review", confidence: 0.9, total: 5, currency: "USD", created_at: "2026-01-01" },
    ],
  });
  assert.deepEqual(
    batch.invoices.map((invoice) => invoice.id),
    ["inv-1", "inv-2"],
  );
  assert.equal(batch.metrics.total, 2);
  assert.equal(batch.source, "kelly-invoice-sheet");
});

test("buildConfigSummary defaults review policy and export settings", () => {
  const summary = buildConfigSummary({});
  assert.equal(summary.default_currency, "USD");
  assert.equal(summary.extraction.low_confidence_threshold, 0.82);
  assert.deepEqual(summary.review_policy.block_missing_fields, [
    "vendor_name",
    "invoice_number",
    "invoice_date",
    "total",
  ]);
  assert.equal(summary.export.include_line_items, true);
});

test("demoInvoices returns the three deterministic demo rows", () => {
  const invoices = demoInvoices();
  assert.equal(invoices.length, 3);
  assert.deepEqual(
    invoices.map((invoice) => invoice.id),
    ["inv-001", "inv-002", "inv-003"],
  );
  assert.equal(invoices[2].status, "blocked");
});
