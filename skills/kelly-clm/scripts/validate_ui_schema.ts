#!/usr/bin/env node
import { demoState } from "../app/server/demo.ts";

const state = demoState({ lang: "en" });
const collections = ["contracts", "obligations", "approvals"] as const;

for (const key of collections) {
  const rows = state[key];
  if (!Array.isArray(rows)) throw new Error(`${key} must be an array`);
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) throw new Error(`${key} contains a missing or duplicate id`);
    ids.add(row.id);
  }
}
if (!state.metrics || state.metrics.contracts !== state.contracts.length) {
  throw new Error("metrics.contracts must match contracts length");
}

console.log(`OK: ${state.contracts.length} contracts, ${state.obligations.length} obligations`);
