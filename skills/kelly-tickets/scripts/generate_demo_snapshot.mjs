#!/usr/bin/env node
// Writes a deterministic sample snapshot into app/.data/ for local development.
// It reuses the demo scene builder so the sample always matches the UI schema.
// Demo mode itself (?demo=<scene>) never reads this file.
// Usage: node scripts/generate_demo_snapshot.mjs [--zh]

import { buildDemoSnapshot } from "../app/server/demo.mjs";
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { ensureDirs, writeJson } from "../app/server/store.mjs";

const zh = process.argv.includes("--zh");
const snapshot = buildDemoSnapshot(zh, "overview");
snapshot.source = "kelly-tickets-sample";

await ensureDirs();
await writeJson(SNAPSHOT_PATH, snapshot);
console.log(`Wrote ${SNAPSHOT_PATH}`);
