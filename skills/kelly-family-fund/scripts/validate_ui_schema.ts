#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/snapshot.json", import.meta.url).pathname;

const CATEGORIES = new Set(["care", "transport", "meal", "gift", "renqing", "medical", "misc"]);

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== "string" || value.length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj: Record<string, unknown>, key: string, path: string): void {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value)) fail(`${path}.${key} must be a number`);
}

function approxEqual(a: unknown, b: unknown, tolerance = 1): boolean {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

const raw = await fs.readFile(target, "utf8").catch((error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot: any;
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
if (!isObject(snapshot.fund)) fail("root.fund must be an object");
requireString(snapshot.fund, "name", "root.fund");
requireString(snapshot.fund, "steward", "root.fund");

for (const key of ["beneficiaries", "families", "income", "expenses", "months", "by_category", "by_family"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}
if (!isObject(snapshot.totals)) fail("root.totals must be an object");
for (const key of ["income_total", "expense_total", "balance", "care_total", "family_total", "avg_family_benefit"]) {
  requireNumber(snapshot.totals, key, "root.totals");
}

const beneficiaryIds = new Set();
snapshot.beneficiaries.forEach((b, index) => {
  const path = `root.beneficiaries[${index}]`;
  if (!isObject(b)) fail(`${path} must be an object`);
  for (const key of ["id", "name"]) requireString(b, key, path);
  requireNumber(b, "pension_monthly", path);
  beneficiaryIds.add(b.id);
});

const familyIds = new Set();
snapshot.families.forEach((f, index) => {
  const path = `root.families[${index}]`;
  if (!isObject(f)) fail(`${path} must be an object`);
  for (const key of ["id", "name"]) requireString(f, key, path);
  if (familyIds.has(f.id)) fail(`${path}.id duplicates ${f.id}`);
  familyIds.add(f.id);
});

snapshot.income.forEach((row, index) => {
  const path = `root.income[${index}]`;
  for (const key of ["id", "month", "beneficiary_id"]) requireString(row, key, path);
  requireNumber(row, "amount", path);
  if (!beneficiaryIds.has(row.beneficiary_id))
    fail(`${path}.beneficiary_id does not match a beneficiary: ${row.beneficiary_id}`);
});

let sumExpense = 0;
let sumCare = 0;
snapshot.expenses.forEach((row, index) => {
  const path = `root.expenses[${index}]`;
  for (const key of ["id", "month", "category"]) requireString(row, key, path);
  requireNumber(row, "amount", path);
  if (!CATEGORIES.has(row.category)) fail(`${path}.category invalid: ${row.category}`);
  if (row.category === "care" && (row.family_id !== null || row.shared !== false)) {
    fail(`${path} care rows must have family_id null and shared false`);
  }
  if (row.family_id != null && !familyIds.has(row.family_id))
    fail(`${path}.family_id does not match a family: ${row.family_id}`);
  sumExpense += row.amount;
  if (row.category === "care") sumCare += row.amount;
});

// Totals must equal the ledger sums.
if (!approxEqual(sumExpense, snapshot.totals.expense_total, 1)) {
  fail(
    `root.totals.expense_total (${snapshot.totals.expense_total}) does not equal sum of expenses (${sumExpense.toFixed(2)})`,
  );
}
if (!approxEqual(sumCare, snapshot.totals.care_total, 1)) {
  fail(
    `root.totals.care_total (${snapshot.totals.care_total}) does not equal sum of care expenses (${sumCare.toFixed(2)})`,
  );
}
const sumIncome = snapshot.income.reduce((sum, row) => sum + (row.amount || 0), 0);
if (!approxEqual(sumIncome, snapshot.totals.income_total, 1)) {
  fail(
    `root.totals.income_total (${snapshot.totals.income_total}) does not equal sum of income (${sumIncome.toFixed(2)})`,
  );
}
if (!approxEqual(snapshot.totals.income_total - snapshot.totals.expense_total, snapshot.totals.balance, 1)) {
  fail("root.totals.balance must equal income_total - expense_total");
}
if (!approxEqual(snapshot.totals.expense_total - snapshot.totals.care_total, snapshot.totals.family_total, 1)) {
  fail("root.totals.family_total must equal expense_total - care_total");
}

// Months: chronological, running balance, sums per month.
let prevMonth = "";
let running = 0;
snapshot.months.forEach((row, index) => {
  const path = `root.months[${index}]`;
  requireString(row, "month", path);
  for (const key of ["income_total", "expense_total", "net", "balance_end"]) requireNumber(row, key, path);
  if (prevMonth && row.month <= prevMonth) fail(`${path}.month must be chronological (after ${prevMonth})`);
  prevMonth = row.month;
  if (!approxEqual(row.income_total - row.expense_total, row.net, 1)) fail(`${path}.net must equal income - expense`);
  running += row.net;
  if (!approxEqual(running, row.balance_end, 1)) fail(`${path}.balance_end must be the running balance`);
});
if (snapshot.months.length && !approxEqual(running, snapshot.totals.balance, 1)) {
  fail("final month balance_end must equal totals.balance");
}

// by_category sums to expense_total.
const catSum = snapshot.by_category.reduce((sum, row) => sum + (row.amount || 0), 0);
snapshot.by_category.forEach((row, index) => {
  const path = `root.by_category[${index}]`;
  requireString(row, "category", path);
  for (const key of ["amount", "pct"]) requireNumber(row, key, path);
  if (!CATEGORIES.has(row.category)) fail(`${path}.category invalid: ${row.category}`);
});
if (snapshot.by_category.length && !approxEqual(catSum, snapshot.totals.expense_total, 1)) {
  fail(`root.by_category amounts (${catSum.toFixed(2)}) must sum to expense_total (${snapshot.totals.expense_total})`);
}

// by_family: benefits sum to family_total; deviations consistent with average.
let benefitSum = 0;
snapshot.by_family.forEach((row, index) => {
  const path = `root.by_family[${index}]`;
  requireString(row, "family_id", path);
  requireString(row, "name", path);
  for (const key of ["benefit_total", "share_pct", "deviation_pct"]) requireNumber(row, key, path);
  if (!familyIds.has(row.family_id)) fail(`${path}.family_id does not match a family: ${row.family_id}`);
  benefitSum += row.benefit_total;
});
if (snapshot.by_family.length && !approxEqual(benefitSum, snapshot.totals.family_total, 1)) {
  fail(`root.by_family benefits (${benefitSum.toFixed(2)}) must sum to family_total (${snapshot.totals.family_total})`);
}
if (snapshot.by_family.length) {
  const shareSum = snapshot.by_family.reduce((sum, row) => sum + (row.share_pct || 0), 0);
  if (!approxEqual(shareSum, 100, 1.5))
    fail(`root.by_family share_pct should sum to ~100% but sum to ${shareSum.toFixed(2)}`);
}

console.log(`OK: ${target}`);
