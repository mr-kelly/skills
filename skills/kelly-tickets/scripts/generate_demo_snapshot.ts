#!/usr/bin/env node
// Writes a deterministic sample snapshot into app/.data/ for local development.
// It reuses the demo scene builder so the sample always matches the UI schema.
// Demo mode itself (?demo=<scene>) never reads this file.
// Usage: node scripts/generate_demo_snapshot.ts [--zh]

import { buildDemoSnapshot } from "../app/server/demo.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const zh = process.argv.includes("--zh");
const snapshot = buildDemoSnapshot(zh, "overview");
snapshot.source = "kelly-tickets-sample";

const provider = await createProvider();
await provider.ensureStore();
await provider.writeSnapshot(snapshot);
console.log(`Wrote sample snapshot via "${provider.kind}" provider.`);
