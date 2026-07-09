import type { DecisionsFile, InvoiceBatch, InvoiceRecord, WorkflowStatus } from "./types.ts";

export const WORKFLOW_STATUSES = [
  "needs_review",
  "changes_requested",
  "approved",
  "done",
  "blocked",
] as const satisfies readonly WorkflowStatus[];

export const DECISION_ACTIONS = ["approve", "request_changes", "revise", "block"] as const;

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
] as const;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function emptyBatch(): InvoiceBatch {
  return recomputeMetrics({
    schema_version: "1",
    batch_id: "empty",
    generated_at: new Date(0).toISOString(),
    source: "kelly-invoice-sheet",
    mode: "app-in-skill",
    extractor: {
      name: "none",
      notes: "No invoice batch exists yet. Ask the skill to extract invoice files or run the demo generator.",
    },
    input_files: [],
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
    invoices: [],
  });
}

export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.82;

export function recomputeMetrics(
  batch: InvoiceBatch,
  lowConfidenceThreshold: number = DEFAULT_LOW_CONFIDENCE_THRESHOLD,
): InvoiceBatch {
  const metrics = {
    total: batch.invoices.length,
    needs_review: 0,
    changes_requested: 0,
    approved: 0,
    done: 0,
    blocked: 0,
    low_confidence: 0,
    total_amount: 0,
    currencies: [] as string[],
  };
  const currencies = new Set<string>();
  for (const invoice of batch.invoices) {
    if (invoice.status in metrics) {
      metrics[invoice.status] += 1;
    }
    if (invoice.confidence < lowConfidenceThreshold) metrics.low_confidence += 1;
    if (typeof invoice.total === "number" && Number.isFinite(invoice.total)) metrics.total_amount += invoice.total;
    if (invoice.currency) currencies.add(invoice.currency);
  }
  metrics.currencies = [...currencies].sort();
  return { ...batch, metrics };
}

export function applyDecisionToInvoice(
  invoice: InvoiceRecord,
  decision?: DecisionsFile["decisions"][string],
): InvoiceRecord {
  if (!decision) return invoice;
  const patch = normalizeInvoicePatch(decision.patch || {});
  const next: InvoiceRecord = { ...invoice, ...patch, decision };
  if (patch.line_items) next.line_items = patch.line_items;
  if (decision.action === "approve") next.status = "approved";
  if (decision.action === "request_changes") next.status = "changes_requested";
  if (decision.action === "block") next.status = "blocked";
  if (decision.action === "revise" && invoice.status === "done") next.status = "needs_review";
  return next;
}

export function mergeDecisions(
  batch: InvoiceBatch,
  decisions: DecisionsFile,
  lowConfidenceThreshold: number = DEFAULT_LOW_CONFIDENCE_THRESHOLD,
): InvoiceBatch {
  return recomputeMetrics(
    {
      ...batch,
      invoices: batch.invoices.map((invoice) => applyDecisionToInvoice(invoice, decisions.decisions[invoice.id])),
    },
    lowConfidenceThreshold,
  );
}

export function normalizeInvoicePatch(patch: Record<string, unknown>): Partial<InvoiceRecord> {
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
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
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
  return normalized as Partial<InvoiceRecord>;
}

export function validateBatchShape(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["batch must be an object"], warnings };
  if (input.schema_version !== "1") errors.push('schema_version must be "1"');
  if (input.source !== "kelly-invoice-sheet") errors.push('source must be "kelly-invoice-sheet"');
  if (!isString(input.batch_id)) errors.push("batch_id is required");
  if (!Array.isArray(input.invoices)) errors.push("invoices must be an array");
  const seen = new Set<string>();
  for (const [index, rawInvoice] of Array.isArray(input.invoices) ? input.invoices.entries() : []) {
    if (!isRecord(rawInvoice)) {
      errors.push(`invoices[${index}] must be an object`);
      continue;
    }
    for (const field of REQUIRED_INVOICE_FIELDS) {
      if (rawInvoice[field] === undefined || rawInvoice[field] === "")
        errors.push(`invoices[${index}].${field} is required`);
    }
    if (isString(rawInvoice.id)) {
      if (seen.has(rawInvoice.id)) errors.push(`duplicate invoice id "${rawInvoice.id}"`);
      seen.add(rawInvoice.id);
    }
    if (!WORKFLOW_STATUSES.includes(rawInvoice.status as WorkflowStatus)) {
      errors.push(`invoices[${index}].status is invalid`);
    }
    if (!isNumber(rawInvoice.total)) errors.push(`invoices[${index}].total must be a number`);
    if (!isNumber(rawInvoice.confidence)) errors.push(`invoices[${index}].confidence must be a number`);
    if (isNumber(rawInvoice.confidence) && (rawInvoice.confidence < 0 || rawInvoice.confidence > 1)) {
      errors.push(`invoices[${index}].confidence must be between 0 and 1`);
    }
    if (!Array.isArray(rawInvoice.risk)) errors.push(`invoices[${index}].risk must be an array`);
    if (!Array.isArray(rawInvoice.warnings)) errors.push(`invoices[${index}].warnings must be an array`);
    if (!Array.isArray(rawInvoice.line_items)) {
      errors.push(`invoices[${index}].line_items must be an array`);
    } else if (rawInvoice.line_items.length === 0) {
      warnings.push(`invoices[${index}] has no line items`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function decisionStatusFor(action: string): WorkflowStatus | null {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return null;
}
