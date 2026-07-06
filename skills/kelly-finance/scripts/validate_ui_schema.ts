#!/usr/bin/env node
import fs from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/validate_ui_schema.ts app/.data/model_snapshot.json");
  process.exit(2);
}

const snapshot = JSON.parse(await fs.readFile(file, "utf8"));
const errors: string[] = [];

function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

expect(typeof snapshot.snapshot_id === "string", "snapshot_id must be a string");
expect(typeof snapshot.generated_at === "string", "generated_at must be a string");
expect(Array.isArray(snapshot.periods), "periods must be an array");
expect(Array.isArray(snapshot.checks), "checks must be an array");
expect(snapshot.metrics && typeof snapshot.metrics === "object", "metrics must be an object");

const statuses = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const severities = new Set(["info", "warning", "critical"]);
for (const [index, check] of (snapshot.checks || []).entries()) {
  expect(typeof check.id === "string" && check.id.length > 0, `checks[${index}].id is required`);
  expect(statuses.has(check.status), `checks[${index}].status is invalid`);
  expect(severities.has(check.severity), `checks[${index}].severity is invalid`);
  expect(Array.isArray(check.evidence), `checks[${index}].evidence must be an array`);
}

for (const [index, period] of (snapshot.periods || []).entries()) {
  for (const key of [
    "revenue",
    "gross_profit",
    "ebitda",
    "net_income",
    "ending_cash",
    "total_assets",
    "free_cash_flow",
  ]) {
    expect(Number.isFinite(Number(period[key])), `periods[${index}].${key} must be numeric`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Valid Kelly Finance snapshot: ${file}`);
