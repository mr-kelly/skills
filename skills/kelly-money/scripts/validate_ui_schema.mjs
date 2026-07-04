#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/ledger_snapshot.json", import.meta.url).pathname;

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj, key, path) {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
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
for (const key of ["account_count", "transaction_count", "gross_inflow", "gross_outflow", "fees", "net"]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!Array.isArray(snapshot.accounts)) fail("root.accounts must be an array");
if (!Array.isArray(snapshot.transactions)) fail("root.transactions must be an array");
if (snapshot.invoices !== undefined && !Array.isArray(snapshot.invoices))
  fail("root.invoices must be an array when present");
if (snapshot.invoice_matches !== undefined && !Array.isArray(snapshot.invoice_matches))
  fail("root.invoice_matches must be an array when present");
if (!Array.isArray(snapshot.warnings)) fail("root.warnings must be an array");

const accountIds = new Set();
snapshot.accounts.forEach((account, index) => {
  const path = `root.accounts[${index}]`;
  if (!isObject(account)) fail(`${path} must be an object`);
  for (const key of ["account_id", "provider", "display_name", "currency", "status"]) requireString(account, key, path);
  if (accountIds.has(account.account_id)) fail(`${path}.account_id duplicates ${account.account_id}`);
  accountIds.add(account.account_id);
  if (!isObject(account.balance)) fail(`${path}.balance must be an object`);
  for (const key of ["available", "pending", "current"]) requireNumber(account.balance, key, `${path}.balance`);
  if (!isObject(account.totals)) fail(`${path}.totals must be an object`);
  for (const key of ["gross_inflow", "gross_outflow", "fees", "net"])
    requireNumber(account.totals, key, `${path}.totals`);
});

const txIds = new Set();
snapshot.transactions.forEach((tx, index) => {
  const path = `root.transactions[${index}]`;
  if (!isObject(tx)) fail(`${path} must be an object`);
  for (const key of [
    "transaction_id",
    "provider",
    "account_id",
    "occurred_at",
    "description",
    "type",
    "status",
    "currency",
    "direction",
  ]) {
    requireString(tx, key, path);
  }
  for (const key of ["gross", "fee", "net"]) requireNumber(tx, key, path);
  if (txIds.has(tx.transaction_id)) fail(`${path}.transaction_id duplicates ${tx.transaction_id}`);
  txIds.add(tx.transaction_id);
  if (!accountIds.has(tx.account_id)) fail(`${path}.account_id does not match an account: ${tx.account_id}`);
});

const invoiceIds = new Set();
(snapshot.invoices || []).forEach((invoice, index) => {
  const path = `root.invoices[${index}]`;
  if (!isObject(invoice)) fail(`${path} must be an object`);
  for (const key of ["invoice_id", "invoice_number", "direction", "issue_date", "status", "currency", "source"]) {
    requireString(invoice, key, path);
  }
  for (const key of ["subtotal", "tax", "total"]) requireNumber(invoice, key, path);
  if (invoiceIds.has(invoice.invoice_id)) fail(`${path}.invoice_id duplicates ${invoice.invoice_id}`);
  invoiceIds.add(invoice.invoice_id);
});

const matchIds = new Set();
(snapshot.invoice_matches || []).forEach((match, index) => {
  const path = `root.invoice_matches[${index}]`;
  if (!isObject(match)) fail(`${path} must be an object`);
  for (const key of [
    "match_id",
    "invoice_id",
    "transaction_id",
    "status",
    "matching_method",
    "matching_rule",
    "review_status",
  ])
    requireString(match, key, path);
  for (const key of ["amount_delta", "date_delta_days", "confidence", "amount_tolerance", "date_tolerance_days"])
    requireNumber(match, key, path);
  if (!Array.isArray(match.candidate_transaction_ids)) fail(`${path}.candidate_transaction_ids must be an array`);
  if (!Array.isArray(match.audit_events)) fail(`${path}.audit_events must be an array`);
  if (matchIds.has(match.match_id)) fail(`${path}.match_id duplicates ${match.match_id}`);
  matchIds.add(match.match_id);
  if (!invoiceIds.has(match.invoice_id)) fail(`${path}.invoice_id does not match an invoice: ${match.invoice_id}`);
  if (!txIds.has(match.transaction_id))
    fail(`${path}.transaction_id does not match a transaction: ${match.transaction_id}`);
});

console.log(`OK: ${target}`);
