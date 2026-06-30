#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/ledger_snapshot.json", import.meta.url).pathname;

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
  for (const key of ["gross_inflow", "gross_outflow", "fees", "net"]) requireNumber(account.totals, key, `${path}.totals`);
});

const txIds = new Set();
snapshot.transactions.forEach((tx, index) => {
  const path = `root.transactions[${index}]`;
  if (!isObject(tx)) fail(`${path} must be an object`);
  for (const key of ["transaction_id", "provider", "account_id", "occurred_at", "description", "type", "status", "currency", "direction"]) {
    requireString(tx, key, path);
  }
  for (const key of ["gross", "fee", "net"]) requireNumber(tx, key, path);
  if (txIds.has(tx.transaction_id)) fail(`${path}.transaction_id duplicates ${tx.transaction_id}`);
  txIds.add(tx.transaction_id);
  if (!accountIds.has(tx.account_id)) fail(`${path}.account_id does not match an account: ${tx.account_id}`);
});

console.log(`OK: ${target}`);
