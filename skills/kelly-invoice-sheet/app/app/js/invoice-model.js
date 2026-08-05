// Domain model for Kelly Invoice Sheet: invoice/receipt/credit-note/statement
// extraction batches under human review, with field confidence, line items,
// and export-ready approved rows. Ported verbatim where a matching function
// already existed (same variable names, same order of operations, only TS
// types stripped) from the retired lib/invoice-schema.ts and lib/common.ts.
// Kelly Invoice Sheet never had a busabase-provider.ts to carry forward, so
// this Base design (invoices + settings) is new.
//
// Architectural change from the retired local-file shape: a human decision
// now lives directly on the invoice's own Busabase record (decision-action/
// decision-note/decided-at alongside the raw invoice fields) instead of a
// separate decisions.json bucket keyed by invoice id — same pattern used
// across this batch of Busabase-only conversions (see kelly-writer,
// kelly-finance). Line items share the exact same lifecycle as their parent
// invoice (created/edited/exported together, never independently reviewed
// or exported on their own), so they stay a JSON array field directly on the
// invoice record instead of a separate Base — same pattern as kelly-writer's
// hashtags/title_options/source_notes. The retired agent_tasks.json queue is
// gone too: a "task" was always just an invoice whose status is
// changes_requested, so it can be derived on read instead of stored
// separately — reads are always live under Busabase, so there is nothing to
// go stale. The retired agent.lock concept does not apply either: Busabase
// writes are per-record ChangeRequests, not a whole-batch file lock.

export const WORKFLOW_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const DECISION_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);
export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.82;

const REQUIRED_INVOICE_FIELDS = [
  "id",
  "ref",
  "title",
  "status",
  "category",
  "source_file",
  "vendor_name",
  "invoice_number",
  "invoice_date",
  "currency",
  "total",
  "confidence",
];

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseJsonArray(value = "") {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Ported verbatim from decisionStatusFor() in the retired lib/invoice-schema.ts.
export function decisionStatusFor(action = "") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return null;
}

// Ported verbatim from normalizeInvoicePatch() in the retired
// lib/invoice-schema.ts.
export function normalizeInvoicePatch(patch = {}) {
  const allowed = new Set([
    "title",
    "category",
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
    "iban_or_account_hint",
    "confidence",
    "risk",
    "warnings",
    "notes",
    "line_items",
  ]);
  const normalized = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!allowed.has(key)) continue;
    if (["subtotal", "tax", "total", "amount_due", "confidence"].includes(key)) {
      if (typeof value === "number" && Number.isFinite(value)) normalized[key] = value;
      continue;
    }
    if (key === "line_items" && Array.isArray(value)) {
      normalized.line_items = value
        .filter(isRecord)
        .map((line, index) => ({
          line_id: isString(line.line_id) ? line.line_id : `line-${index + 1}`,
          description: isString(line.description) ? line.description : "",
          quantity: isNumber(line.quantity) ? line.quantity : undefined,
          unit_price: isNumber(line.unit_price) ? line.unit_price : undefined,
          amount: isNumber(line.amount) ? line.amount : undefined,
          tax_rate: isNumber(line.tax_rate) ? line.tax_rate : undefined,
          category: isString(line.category) ? line.category : undefined,
          confidence: isNumber(line.confidence) ? line.confidence : undefined,
          notes: isString(line.notes) ? line.notes : undefined,
        }))
        .filter((line) => line.description || line.amount !== undefined);
      continue;
    }
    if (key === "risk" || key === "warnings") {
      normalized[key] = Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
      continue;
    }
    normalized[key] = typeof value === "string" ? value : value;
  }
  return normalized;
}

// Ported verbatim from applyDecisionToInvoice() in the retired
// lib/invoice-schema.ts. `decision` carries {item_id, action, comment,
// patch, decided_at}; the Busabase-only shape writes the result straight
// onto the invoice's own record instead of a separate decisions.json bucket.
export function applyDecisionToInvoice(invoice, decision) {
  if (!decision) return invoice;
  const patch = normalizeInvoicePatch(decision.patch || {});
  const next = { ...invoice, ...patch, decision };
  if (patch.line_items) next.line_items = patch.line_items;
  if (decision.action === "approve") next.status = "approved";
  if (decision.action === "request_changes") next.status = "changes_requested";
  if (decision.action === "block") next.status = "blocked";
  if (decision.action === "revise" && invoice.status === "done") next.status = "needs_review";
  return next;
}

// Ported verbatim from recomputeMetrics() in the retired lib/invoice-schema.ts,
// operating on a plain invoices array instead of a batch wrapper object.
export function recomputeMetrics(invoices = [], lowConfidenceThreshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD) {
  const metrics = {
    total: invoices.length,
    needs_review: 0,
    changes_requested: 0,
    approved: 0,
    done: 0,
    blocked: 0,
    low_confidence: 0,
    total_amount: 0,
    currencies: [],
  };
  const currencies = new Set();
  for (const invoice of invoices) {
    if (invoice.status in metrics) metrics[invoice.status] += 1;
    if (typeof invoice.confidence === "number" && invoice.confidence < lowConfidenceThreshold) {
      metrics.low_confidence += 1;
    }
    if (typeof invoice.total === "number" && Number.isFinite(invoice.total)) metrics.total_amount += invoice.total;
    if (invoice.currency) currencies.add(invoice.currency);
  }
  metrics.currencies = [...currencies].sort();
  return metrics;
}

// Ported in spirit from validateBatchShape() in the retired
// lib/invoice-schema.ts, operating directly on an invoices array (there is
// no more batch wrapper needing schema_version/source checks). Used by
// scripts/import_batch.mjs before writing to Busabase.
export function validateInvoicesShape(invoices) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(invoices)) return { ok: false, errors: ["invoices must be an array"], warnings };
  const seen = new Set();
  for (const [index, rawInvoice] of invoices.entries()) {
    if (!isRecord(rawInvoice)) {
      errors.push(`invoices[${index}] must be an object`);
      continue;
    }
    for (const field of REQUIRED_INVOICE_FIELDS) {
      if (rawInvoice[field] === undefined || rawInvoice[field] === "") {
        errors.push(`invoices[${index}].${field} is required`);
      }
    }
    if (isString(rawInvoice.id)) {
      if (seen.has(rawInvoice.id)) errors.push(`duplicate invoice id "${rawInvoice.id}"`);
      seen.add(rawInvoice.id);
    }
    if (!WORKFLOW_STATUSES.includes(rawInvoice.status)) {
      errors.push(`invoices[${index}].status is invalid`);
    }
    if (!isNumber(rawInvoice.total)) errors.push(`invoices[${index}].total must be a number`);
    if (!isNumber(rawInvoice.confidence)) errors.push(`invoices[${index}].confidence must be a number`);
    if (isNumber(rawInvoice.confidence) && (rawInvoice.confidence < 0 || rawInvoice.confidence > 1)) {
      errors.push(`invoices[${index}].confidence must be between 0 and 1`);
    }
    if (rawInvoice.risk !== undefined && !Array.isArray(rawInvoice.risk)) {
      errors.push(`invoices[${index}].risk must be an array`);
    }
    if (rawInvoice.warnings !== undefined && !Array.isArray(rawInvoice.warnings)) {
      errors.push(`invoices[${index}].warnings must be an array`);
    }
    if (rawInvoice.line_items !== undefined && !Array.isArray(rawInvoice.line_items)) {
      errors.push(`invoices[${index}].line_items must be an array`);
    } else if (Array.isArray(rawInvoice.line_items) && rawInvoice.line_items.length === 0) {
      warnings.push(`invoices[${index}] has no line items`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// Only known field slugs are ever written back — never spread a raw row (it
// also carries __recordId/__headCommitId bookkeeping keys that must not be
// sent as Busabase fields). Every destructured parameter carries a default
// so checkJs never infers a required-but-absent property. Money fields
// default to 0 rather than staying undefined/empty: the "number" Busabase
// field type has no null representation, so (unlike the retired optional TS
// fields) a genuinely-unknown amount cannot be distinguished from a
// confirmed zero — the same simplification used across this batch of
// conversions.
export function baseInvoiceFields({
  id = "",
  ref = "",
  batch_id = "",
  title = "",
  status = "needs_review",
  category = "vendor_invoice",
  source_file = "",
  source_path = "",
  source_type = "",
  source_page = 0,
  vendor_name = "",
  vendor_tax_id = "",
  invoice_number = "",
  invoice_date = "",
  due_date = "",
  currency = "USD",
  subtotal = 0,
  tax = 0,
  total = 0,
  amount_due = 0,
  payment_terms = "",
  bill_to = "",
  purchase_order = "",
  iban_or_account_hint = "",
  confidence = 0,
  field_confidence = {},
  risk = [],
  warnings = [],
  notes = "",
  line_items = [],
  proposed_action = "",
  reason = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  created_at = "",
} = {}) {
  return {
    invoice_id: id,
    ref,
    batch_id,
    title,
    status,
    category,
    source_file,
    source_path,
    source_type,
    source_page: Number(source_page) || 0,
    vendor_name,
    vendor_tax_id,
    invoice_number,
    invoice_date,
    due_date,
    currency,
    subtotal: Number(subtotal) || 0,
    tax: Number(tax) || 0,
    total: Number(total) || 0,
    amount_due: Number(amount_due) || 0,
    payment_terms,
    bill_to,
    purchase_order,
    iban_or_account_hint,
    confidence: Number(confidence) || 0,
    field_confidence: JSON.stringify(field_confidence || {}),
    risk: JSON.stringify(risk || []),
    warnings: JSON.stringify(warnings || []),
    notes,
    line_items: JSON.stringify(line_items || []),
    proposed_action,
    reason,
    decision_action,
    decision_note,
    decided_at,
    created_at,
  };
}

// Normalizes a Busabase `invoices` row (already snake_cased by the provider)
// into the structured InvoiceRecord shape the UI renders, reassembling the
// `decision` convenience object only once a human has actually decided —
// mirrors computeReviewFromRow() in kelly-homework-coach's homework-model.js.
export function computeInvoiceFromRow({
  invoice_id = "",
  ref = "",
  batch_id = "",
  title = "",
  status = "needs_review",
  category = "vendor_invoice",
  source_file = "",
  source_path = "",
  source_type = "",
  source_page = 0,
  vendor_name = "",
  vendor_tax_id = "",
  invoice_number = "",
  invoice_date = "",
  due_date = "",
  currency = "USD",
  subtotal = 0,
  tax = 0,
  total = 0,
  amount_due = 0,
  payment_terms = "",
  bill_to = "",
  purchase_order = "",
  iban_or_account_hint = "",
  confidence = 0,
  field_confidence = "",
  risk = "",
  warnings = "",
  notes = "",
  line_items = "",
  proposed_action = "",
  reason = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  created_at = "",
  __recordId = undefined,
  __headCommitId = undefined,
} = {}) {
  const decision = decision_action
    ? { action: decision_action, comment: decision_note || "", decided_at: decided_at || "" }
    : undefined;
  return {
    id: invoice_id,
    ref,
    batch_id,
    title,
    status: status || "needs_review",
    category,
    source_file,
    source_path,
    source_type,
    source_page: Number(source_page) || 0,
    vendor_name,
    vendor_tax_id,
    invoice_number,
    invoice_date,
    due_date,
    currency,
    subtotal: Number(subtotal) || 0,
    tax: Number(tax) || 0,
    total: Number(total) || 0,
    amount_due: Number(amount_due) || 0,
    payment_terms,
    bill_to,
    purchase_order,
    iban_or_account_hint,
    confidence: Number(confidence) || 0,
    field_confidence: parseJsonObject(field_confidence),
    risk: parseJsonArray(risk),
    warnings: parseJsonArray(warnings),
    notes,
    line_items: parseJsonArray(line_items),
    proposed_action,
    reason,
    decision_note,
    decided_at,
    decision,
    created_at,
    __recordId,
    __headCommitId,
  };
}

// Assembles the batch shape app.js renders, mirroring the retired
// InvoiceBatch interface (lib/types.ts) minus the extractor/input_files
// bookkeeping metadata about a single extraction run (see module comment —
// Busabase now accumulates invoices across every scripts/import_batch.mjs
// run, so there is no longer one single "current batch").
export function assembleBatch({ invoices = [], lowConfidenceThreshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD } = {}) {
  const sorted = [...invoices].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-invoice-sheet",
    mode: "app-in-skill",
    metrics: recomputeMetrics(sorted, lowConfidenceThreshold),
    invoices: sorted,
  };
}

// Ported in spirit from summarizeConfig() in the retired
// local-file-provider.ts; `payload` is the parsed settings row's JSON.
export function buildConfigSummary(payload = {}) {
  const extraction = payload.extraction || {};
  const reviewPolicy = payload.review_policy || {};
  return {
    data_provider: "busabase",
    default_currency: payload.default_currency || "USD",
    export: {
      directory: payload.export?.directory || "exports/<batch-id>",
      include_line_items: payload.export?.include_line_items !== false,
    },
    extraction: {
      preferred_ocr: extraction.preferred_ocr || "agent-provided",
      low_confidence_threshold:
        typeof extraction.low_confidence_threshold === "number"
          ? extraction.low_confidence_threshold
          : DEFAULT_LOW_CONFIDENCE_THRESHOLD,
    },
    review_policy: {
      auto_approve_min_confidence: reviewPolicy.auto_approve_min_confidence ?? null,
      block_missing_fields: Array.isArray(reviewPolicy.block_missing_fields)
        ? reviewPolicy.block_missing_fields
        : ["vendor_name", "invoice_number", "invoice_date", "total"],
    },
  };
}

// Deterministic, explicitly-labeled demo dataset — ported verbatim (same
// ids, same figures, same warnings) from the retired
// scripts/generate_demo_batch.ts. Shared by js/providers/demo-provider.js so
// the offline ?demo= scenario always matches what the retired generator used
// to write to app/.data/current_batch.json.
export function demoInvoices() {
  return [
    {
      id: "inv-001",
      ref: "Review #1",
      batch_id: "invoice-demo",
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
      created_at: "2026-06-30T09:00:00.000Z",
    },
    {
      id: "inv-002",
      ref: "Review #2",
      batch_id: "invoice-demo",
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
      created_at: "2026-06-01T08:00:00.000Z",
    },
    {
      id: "inv-003",
      ref: "Review #3",
      batch_id: "invoice-demo",
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
      created_at: "2026-06-24T10:00:00.000Z",
    },
  ];
}
