#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/snapshot.json", import.meta.url).pathname;

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

function requireEnum(obj, key, path, allowed) {
  if (!allowed.includes(obj[key])) fail(`${path}.${key} must be one of ${allowed.join("|")}, got ${obj[key]}`);
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
requireString(snapshot, "snapshot_id", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "base_currency", "root");
if (!Array.isArray(snapshot.accounts)) fail("root.accounts must be an array");
if (!Array.isArray(snapshot.positions)) fail("root.positions must be an array");
if (!Array.isArray(snapshot.allocation)) fail("root.allocation must be an array");

if (!isObject(snapshot.totals)) fail("root.totals must be an object");
for (const key of [
  "market_value",
  "cost_basis",
  "unrealized_pnl",
  "unrealized_pnl_pct",
  "day_change",
  "day_change_pct",
  "total_cash",
]) {
  requireNumber(snapshot.totals, key, "root.totals");
}

const accountIds = new Set();
snapshot.accounts.forEach((account, index) => {
  const path = `root.accounts[${index}]`;
  if (!isObject(account)) fail(`${path} must be an object`);
  requireString(account, "account_id", path);
  requireEnum(account, "account_type", path, ["CASH", "MARGIN"]);
  requireString(account, "currency", path);
  for (const key of ["net_liquidation", "total_cash", "buying_power"]) requireNumber(account, key, path);
  if (accountIds.has(account.account_id)) fail(`${path}.account_id duplicates ${account.account_id}`);
  accountIds.add(account.account_id);
});

const symbols = new Set();
snapshot.positions.forEach((position, index) => {
  const path = `root.positions[${index}]`;
  if (!isObject(position)) fail(`${path} must be an object`);
  for (const key of ["symbol", "account_id", "currency"]) requireString(position, key, path);
  requireEnum(position, "asset_type", path, ["STOCK", "ETF", "OPTION", "CRYPTO", "OTHER"]);
  for (const key of [
    "quantity",
    "avg_cost",
    "last_price",
    "market_value",
    "cost_basis",
    "unrealized_pnl",
    "unrealized_pnl_pct",
    "day_change",
    "day_change_pct",
    "weight_pct",
  ]) {
    requireNumber(position, key, path);
  }
  const key = `${position.symbol}@${position.account_id}`;
  if (symbols.has(key)) fail(`${path} duplicates ${key}`);
  symbols.add(key);
  if (!accountIds.has(position.account_id))
    fail(`${path}.account_id does not match an account: ${position.account_id}`);
});

snapshot.allocation.forEach((slice, index) => {
  const path = `root.allocation[${index}]`;
  if (!isObject(slice)) fail(`${path} must be an object`);
  requireEnum(slice, "asset_type", path, ["STOCK", "ETF", "OPTION", "CRYPTO", "OTHER"]);
  for (const key of ["market_value", "weight_pct"]) requireNumber(slice, key, path);
});

// Consistency: totals.market_value should equal the sum of position market values.
const sumMarketValue = snapshot.positions.reduce((sum, p) => sum + Number(p.market_value || 0), 0);
if (Math.abs(sumMarketValue - snapshot.totals.market_value) > 0.5) {
  fail(`totals.market_value (${snapshot.totals.market_value}) != sum of positions (${sumMarketValue.toFixed(2)})`);
}

// Consistency: allocation weights should sum to ~100% when positions exist.
if (snapshot.positions.length) {
  const weightSum = snapshot.allocation.reduce((sum, s) => sum + Number(s.weight_pct || 0), 0);
  if (Math.abs(weightSum - 100) > 1) fail(`allocation weight_pct sums to ${weightSum.toFixed(2)}, expected ~100`);
}

console.log(`OK: ${target}`);
