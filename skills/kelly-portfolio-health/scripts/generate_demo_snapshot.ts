#!/usr/bin/env node
import { buildSnapshot } from "../app/server/dataset.ts";
// Seed script: writes a deterministic ~50-contract mock RBF/private-credit book
// to app/.data/snapshot.json so the dashboard has something to show without
// any external data source. Safe to re-run; it always overwrites.
import { ensureDirs, writeJson } from "../lib/common.ts";
import { SNAPSHOT_PATH } from "../lib/paths.ts";

async function main(): Promise<void> {
  const count = Number.parseInt(process.argv[2] || "52", 10);
  await ensureDirs();
  const snapshot = buildSnapshot(count);
  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`Wrote ${snapshot.contracts.length} contracts to ${SNAPSHOT_PATH}`);
}

await main();
