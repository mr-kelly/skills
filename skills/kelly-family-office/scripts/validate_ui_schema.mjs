#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/snapshot.json", import.meta.url).pathname;

const ENTITY_TYPES = new Set(["INDIVIDUAL", "TRUST", "COMPANY", "FUND", "FOUNDATION"]);
const ASSET_CLASSES = new Set([
  "EQUITY",
  "BOND",
  "CASH",
  "CRYPTO",
  "REAL_ESTATE",
  "PRIVATE_EQUITY",
  "ALTERNATIVE",
]);

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

function approxEqual(a, b, tolerance = 1) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
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
requireString(snapshot, "source", "root");
requireString(snapshot, "base_currency", "root");
if (!isObject(snapshot.fx_rates)) fail("root.fx_rates must be an object");
if (typeof snapshot.fx_rates[snapshot.base_currency] !== "number")
  fail(`root.fx_rates must contain a rate for base currency ${snapshot.base_currency}`);

for (const key of ["entities", "accounts", "holdings", "by_entity", "by_asset_class", "by_institution", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}
if (!isObject(snapshot.totals)) fail("root.totals must be an object");
for (const key of ["aum_base", "cost_basis_base", "unrealized_pnl_base", "unrealized_pnl_pct"]) {
  requireNumber(snapshot.totals, key, "root.totals");
}

const entityIds = new Set();
snapshot.entities.forEach((entity, index) => {
  const path = `root.entities[${index}]`;
  if (!isObject(entity)) fail(`${path} must be an object`);
  for (const key of ["entity_id", "name", "type"]) requireString(entity, key, path);
  if (!ENTITY_TYPES.has(entity.type)) fail(`${path}.type invalid: ${entity.type}`);
  if (entityIds.has(entity.entity_id)) fail(`${path}.entity_id duplicates ${entity.entity_id}`);
  entityIds.add(entity.entity_id);
});

const accountIds = new Set();
snapshot.accounts.forEach((account, index) => {
  const path = `root.accounts[${index}]`;
  if (!isObject(account)) fail(`${path} must be an object`);
  for (const key of ["account_id", "entity_id", "institution", "currency"]) requireString(account, key, path);
  if (!entityIds.has(account.entity_id)) fail(`${path}.entity_id does not match an entity: ${account.entity_id}`);
  if (accountIds.has(account.account_id)) fail(`${path}.account_id duplicates ${account.account_id}`);
  accountIds.add(account.account_id);
});

const holdingIds = new Set();
let sumMarketBase = 0;
let sumCostBase = 0;
snapshot.holdings.forEach((holding, index) => {
  const path = `root.holdings[${index}]`;
  if (!isObject(holding)) fail(`${path} must be an object`);
  for (const key of ["holding_id", "entity_id", "account_id", "symbol", "name", "asset_class", "currency"]) {
    requireString(holding, key, path);
  }
  if (!ASSET_CLASSES.has(holding.asset_class)) fail(`${path}.asset_class invalid: ${holding.asset_class}`);
  for (const key of ["quantity", "market_value", "cost_basis", "market_value_base", "cost_basis_base", "unrealized_pnl_base"]) {
    requireNumber(holding, key, path);
  }
  if (holdingIds.has(holding.holding_id)) fail(`${path}.holding_id duplicates ${holding.holding_id}`);
  holdingIds.add(holding.holding_id);
  if (!entityIds.has(holding.entity_id)) fail(`${path}.entity_id does not match an entity: ${holding.entity_id}`);
  if (!accountIds.has(holding.account_id)) fail(`${path}.account_id does not match an account: ${holding.account_id}`);
  sumMarketBase += holding.market_value_base;
  sumCostBase += holding.cost_basis_base;
});

if (snapshot.holdings.length && !approxEqual(sumMarketBase, snapshot.totals.aum_base, 1)) {
  fail(`root.totals.aum_base (${snapshot.totals.aum_base}) does not equal sum of holdings market_value_base (${sumMarketBase.toFixed(2)})`);
}
if (snapshot.holdings.length && !approxEqual(sumCostBase, snapshot.totals.cost_basis_base, 1)) {
  fail(`root.totals.cost_basis_base (${snapshot.totals.cost_basis_base}) does not equal sum of holdings cost_basis_base (${sumCostBase.toFixed(2)})`);
}

snapshot.by_entity.forEach((row, index) => {
  const path = `root.by_entity[${index}]`;
  for (const key of ["entity_id", "name"]) requireString(row, key, path);
  for (const key of ["aum_base", "weight_pct", "unrealized_pnl_base"]) requireNumber(row, key, path);
  if (!entityIds.has(row.entity_id)) fail(`${path}.entity_id does not match an entity: ${row.entity_id}`);
});

snapshot.by_asset_class.forEach((row, index) => {
  const path = `root.by_asset_class[${index}]`;
  requireString(row, "asset_class", path);
  for (const key of ["aum_base", "weight_pct"]) requireNumber(row, key, path);
});

snapshot.by_institution.forEach((row, index) => {
  const path = `root.by_institution[${index}]`;
  requireString(row, "institution", path);
  for (const key of ["aum_base", "weight_pct"]) requireNumber(row, key, path);
});

for (const [name, rows] of [
  ["by_entity", snapshot.by_entity],
  ["by_asset_class", snapshot.by_asset_class],
  ["by_institution", snapshot.by_institution],
]) {
  if (!rows.length) continue;
  const weightSum = rows.reduce((sum, row) => sum + (row.weight_pct || 0), 0);
  if (!approxEqual(weightSum, 100, 1.5)) fail(`root.${name} weights should sum to ~100% but sum to ${weightSum.toFixed(2)}`);
}

console.log(`OK: ${target}`);
