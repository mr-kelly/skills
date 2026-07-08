#!/usr/bin/env node
// Writes a deterministic sample snapshot into app/.data/ for local development.
// It reuses the demo scene builder so the sample always matches the UI schema.
// Demo mode itself (?demo=<scene>) never reads this file.
// Usage: node scripts/generate_demo_snapshot.ts [--zh]

import { buildDemoSnapshot } from "../app/server/demo.ts";
import { ensureDirs } from "../lib/common.ts";
import { createProvider } from "../lib/data-provider/index.ts";
import { SNAPSHOT_PATH } from "../lib/paths.ts";

const zh = process.argv.includes("--zh");
const snapshot = buildDemoSnapshot(zh, "today");
snapshot.source = "kelly-standup-sample";

const provider = await createProvider();
await ensureDirs();
await provider.putSnapshot(snapshot);
console.log(`Wrote ${SNAPSHOT_PATH}`);
