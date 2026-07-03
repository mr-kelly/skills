#!/usr/bin/env node
// Validates an audit snapshot against the schema in references/audit-schema.md.
// Usage: node scripts/validate_ui_schema.mjs [path/to/audit_snapshot.json]

import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/audit_snapshot.json", import.meta.url).pathname;

const RULES = new Set(["missing_invoice", "amount_mismatch", "overdue_receivable", "duplicate", "unmatched_payment", "irregular_entry"]);
const SEVERITIES = new Set(["low", "medium", "high"]);
const WORKFLOW_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const INVOICE_STATUSES = new Set(["open", "partial", "paid", "overdue", "credit_note"]);
const ORDER_INVOICE_STATUSES = new Set(["invoiced", "missing", "mismatch"]);
const ORDER_PAYMENT_STATUSES = new Set(["paid", "partial", "unpaid"]);
const PROPOSED_ACTIONS = new Set(["chase_receivable", "reissue_invoice", "flag_to_accountant"]);

function fail(message) {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj, key, path, allowEmpty = false) {
  if (typeof obj[key] !== "string" || (!allowEmpty && obj[key].length === 0)) {
    fail(`${path}.${key} must be a non-empty string`);
  }
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

const raw = await fs.readFile(target, "utf8").catch((error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${error.message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
requireString(snapshot, "base_currency", "root");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "order_count", "invoice_count", "payment_count", "matched_payment_count", "matched_pct",
  "anomaly_count", "open_anomaly_count", "at_stake_total", "receivable_total", "overdue_receivable_total"
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!Array.isArray(snapshot.metrics.aging)) fail("root.metrics.aging must be an array");
snapshot.metrics.aging.forEach((entry, index) => {
  const path = `root.metrics.aging[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  requireString(entry, "bucket", path);
  requireNumber(entry, "amount", path);
});
for (const key of ["orders", "invoices", "payments", "matches", "anomalies", "import_log", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const orderIds = new Set();
const orderNos = new Set();
snapshot.orders.forEach((order, index) => {
  const path = `root.orders[${index}]`;
  if (!isObject(order)) fail(`${path} must be an object`);
  for (const key of ["order_id", "order_no", "customer", "order_date", "currency", "invoice_status", "payment_status"]) {
    requireString(order, key, path);
  }
  requireNumber(order, "amount", path);
  if (!ORDER_INVOICE_STATUSES.has(order.invoice_status)) fail(`${path}.invoice_status invalid: ${order.invoice_status}`);
  if (!ORDER_PAYMENT_STATUSES.has(order.payment_status)) fail(`${path}.payment_status invalid: ${order.payment_status}`);
  for (const key of ["invoice_ids", "payment_ids", "anomaly_ids"]) {
    if (!Array.isArray(order[key])) fail(`${path}.${key} must be an array`);
  }
  if (orderIds.has(order.order_id)) fail(`${path}.order_id duplicates ${order.order_id}`);
  orderIds.add(order.order_id);
  orderNos.add(order.order_no);
});

const invoiceIds = new Set();
snapshot.invoices.forEach((invoice, index) => {
  const path = `root.invoices[${index}]`;
  if (!isObject(invoice)) fail(`${path} must be an object`);
  for (const key of ["invoice_id", "invoice_no", "customer", "issue_date", "currency", "status"]) {
    requireString(invoice, key, path);
  }
  requireString(invoice, "order_no", path, true);
  requireString(invoice, "due_date", path, true);
  for (const key of ["amount", "paid_amount", "outstanding", "days_overdue"]) {
    requireNumber(invoice, key, path);
  }
  if (!INVOICE_STATUSES.has(invoice.status)) fail(`${path}.status invalid: ${invoice.status}`);
  if (!Array.isArray(invoice.payment_ids)) fail(`${path}.payment_ids must be an array`);
  if (invoice.order_no && !orderNos.has(invoice.order_no) && invoice.order_id) {
    fail(`${path}.order_no does not match an order: ${invoice.order_no}`);
  }
  if (invoiceIds.has(invoice.invoice_id)) fail(`${path}.invoice_id duplicates ${invoice.invoice_id}`);
  invoiceIds.add(invoice.invoice_id);
});

const paymentIds = new Set();
snapshot.payments.forEach((payment, index) => {
  const path = `root.payments[${index}]`;
  if (!isObject(payment)) fail(`${path} must be an object`);
  for (const key of ["payment_id", "payment_ref", "paid_date", "currency", "method", "match_status"]) {
    requireString(payment, key, path);
  }
  requireNumber(payment, "amount", path);
  if (!["matched", "unmatched"].includes(payment.match_status)) fail(`${path}.match_status invalid: ${payment.match_status}`);
  if (payment.match_status === "matched" && !invoiceIds.has(payment.invoice_id)) {
    fail(`${path}.invoice_id does not match an invoice: ${payment.invoice_id}`);
  }
  if (paymentIds.has(payment.payment_id)) fail(`${path}.payment_id duplicates ${payment.payment_id}`);
  paymentIds.add(payment.payment_id);
});

snapshot.matches.forEach((match, index) => {
  const path = `root.matches[${index}]`;
  if (!isObject(match)) fail(`${path} must be an object`);
  for (const key of ["match_id", "invoice_id", "payment_id"]) requireString(match, key, path);
  requireNumber(match, "amount_delta", path);
  if (!invoiceIds.has(match.invoice_id)) fail(`${path}.invoice_id does not match an invoice: ${match.invoice_id}`);
  if (!paymentIds.has(match.payment_id)) fail(`${path}.payment_id does not match a payment: ${match.payment_id}`);
});

const anomalyIds = new Set();
const refs = new Set();
snapshot.anomalies.forEach((anomaly, index) => {
  const path = `root.anomalies[${index}]`;
  if (!isObject(anomaly)) fail(`${path} must be an object`);
  for (const key of ["id", "rule", "severity", "status", "title", "reason", "proposed_action", "currency", "created_at"]) {
    requireString(anomaly, key, path);
  }
  requireNumber(anomaly, "ref", path);
  requireNumber(anomaly, "amount_at_stake", path);
  if (!RULES.has(anomaly.rule)) fail(`${path}.rule invalid: ${anomaly.rule}`);
  if (!SEVERITIES.has(anomaly.severity)) fail(`${path}.severity invalid: ${anomaly.severity}`);
  if (!WORKFLOW_STATUSES.has(anomaly.status)) fail(`${path}.status invalid: ${anomaly.status}`);
  if (!PROPOSED_ACTIONS.has(anomaly.proposed_action)) fail(`${path}.proposed_action invalid: ${anomaly.proposed_action}`);
  if (!isObject(anomaly.evidence)) fail(`${path}.evidence must be an object`);
  if (!Array.isArray(anomaly.evidence.rows)) fail(`${path}.evidence.rows must be an array`);
  if (!Array.isArray(anomaly.evidence.payment_ids)) fail(`${path}.evidence.payment_ids must be an array`);
  anomaly.evidence.rows.forEach((row, rowIndex) => {
    const rowPath = `${path}.evidence.rows[${rowIndex}]`;
    if (!isObject(row)) fail(`${rowPath} must be an object`);
    requireString(row, "label", rowPath);
    requireNumber(row, "amount", rowPath);
  });
  if (anomaly.evidence.order_id && !orderIds.has(anomaly.evidence.order_id)) {
    fail(`${path}.evidence.order_id does not match an order: ${anomaly.evidence.order_id}`);
  }
  if (anomaly.evidence.invoice_id && !invoiceIds.has(anomaly.evidence.invoice_id)) {
    fail(`${path}.evidence.invoice_id does not match an invoice: ${anomaly.evidence.invoice_id}`);
  }
  for (const paymentId of anomaly.evidence.payment_ids) {
    if (!paymentIds.has(paymentId)) fail(`${path}.evidence.payment_ids has unknown payment: ${paymentId}`);
  }
  if (anomalyIds.has(anomaly.id)) fail(`${path}.id duplicates ${anomaly.id}`);
  anomalyIds.add(anomaly.id);
  if (refs.has(anomaly.ref)) fail(`${path}.ref duplicates ${anomaly.ref}`);
  refs.add(anomaly.ref);
});

snapshot.import_log.forEach((entry, index) => {
  const path = `root.import_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  requireString(entry, "import_id", path);
  requireString(entry, "imported_at", path);
  if (!isObject(entry.files)) fail(`${path}.files must be an object`);
  if (!isObject(entry.added)) fail(`${path}.added must be an object`);
  if (!Array.isArray(entry.warnings)) fail(`${path}.warnings must be an array`);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  requireString(warning, "id", path);
  requireString(warning, "message", path);
});

console.log(`OK: ${target}`);
