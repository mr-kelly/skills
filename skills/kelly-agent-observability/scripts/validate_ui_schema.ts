#!/usr/bin/env node
import { demoStatePayload } from "../app/server/demo.ts";

const state = demoStatePayload({ demo: "schema-validation" });
const fleet = state.fleet as Record<string, unknown>;

if (fleet.schema_version !== "1") throw new Error("fleet.schema_version must be 1");
if (!Array.isArray(fleet.agents) || fleet.agents.length === 0) throw new Error("fleet.agents must be non-empty");
if (!Array.isArray(fleet.metrics) || fleet.metrics.length !== fleet.agents.length) {
  throw new Error("fleet.metrics must contain one row per agent");
}
if (!Array.isArray(fleet.traces)) throw new Error("fleet.traces must be an array");

const ids = new Set<string>();
for (const raw of fleet.agents as Array<Record<string, unknown>>) {
  const id = String(raw.agent_id || "");
  if (!id || ids.has(id)) throw new Error(`invalid or duplicate agent_id: ${id}`);
  ids.add(id);
}

console.log(`OK: ${ids.size} agents and ${fleet.traces.length} traces`);
