#!/usr/bin/env node
// Local-file seed utility: writes the demo brand-narrative snapshot to
// app/.data/brand_snapshot.json so the default local provider has something to
// serve. Writing a snapshot is not part of the review model (the agent produces
// it via the skill), so this seeder writes the local handoff file directly using
// the shared path from lib/paths.ts.
import fs from "node:fs/promises";
import { demoStatePayload } from "../app/server/demo.ts";
import { dataDir, snapshotPath } from "../lib/paths.ts";

const now = new Date().toISOString();

const snapshot = demoStatePayload({ demo: "overview" }).snapshot as Record<string, unknown>;
snapshot.generated_at = now;
snapshot.source = "kelly-brand-demo";

await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`Wrote ${snapshotPath}`);
