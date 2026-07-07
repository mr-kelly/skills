#!/usr/bin/env node
import { readJson } from "../lib/common.ts";
import { SNAPSHOT_PATH } from "../lib/paths.ts";
import type { Snapshot } from "../lib/types.ts";

const file = process.argv[2] || SNAPSHOT_PATH;
const snapshot = (await readJson<Snapshot>(file, null)) as Snapshot | null;
if (!snapshot) fail(`Snapshot not found: ${file}`);

const errors: string[] = [];
if (snapshot.schema_version !== "1") errors.push("schema_version must be 1");
if (!snapshot.generated_at) errors.push("generated_at is required");
if (!snapshot.source) errors.push("source is required");
if (!snapshot.workspace || typeof snapshot.workspace !== "object") errors.push("workspace is required");
if (!Array.isArray(snapshot.entities)) errors.push("entities must be an array");
if (!Array.isArray(snapshot.items)) errors.push("items must be an array");
if (!Array.isArray(snapshot.checks)) errors.push("checks must be an array");

const ids = new Set<string>();
for (const [index, item] of (snapshot.items || []).entries()) {
  if (!item.id) errors.push(`items[${index}].id is required`);
  if (ids.has(item.id)) errors.push(`duplicate item id: ${item.id}`);
  ids.add(item.id);
  if (!item.ref) errors.push(`items[${index}].ref is required`);
  if (!item.title) errors.push(`items[${index}].title is required`);
  if (!["needs_review", "changes_requested", "approved", "done", "blocked"].includes(item.status)) {
    errors.push(`items[${index}].status is invalid: ${item.status}`);
  }
  if (!item.summary) errors.push(`items[${index}].summary is required`);
}

for (const [index, check] of (snapshot.checks || []).entries()) {
  if (!check.id) errors.push(`checks[${index}].id is required`);
  if (!["pass", "warn", "fail"].includes(check.status))
    errors.push(`checks[${index}].status is invalid: ${check.status}`);
}

if (errors.length) fail(errors.join("\n"));
console.log(`OK ${file}: ${snapshot.items.length} items, ${snapshot.checks.length} checks`);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
