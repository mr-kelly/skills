#!/usr/bin/env node
import { demoState } from "../app/server/demo.ts";

const state = demoState({ demo: "schema-validation", lang: "en" });
const batch = state.batch as Record<string, unknown>;

if (!batch.batch_id || !batch.generated_at) throw new Error("batch id and generated_at are required");
for (const key of ["topics", "todos", "distribution"] as const) {
  const rows = batch[key];
  if (!Array.isArray(rows)) throw new Error(`batch.${key} must be an array`);
  const ids = new Set<string>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const id = String(row.id || "");
    if (!id || ids.has(id)) throw new Error(`batch.${key} contains a missing or duplicate id`);
    ids.add(id);
  }
}

console.log(`OK: ${(batch.distribution as unknown[]).length} distribution drafts`);
