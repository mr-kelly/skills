#!/usr/bin/env node
import { demoSnapshot } from "../app/server/demo.ts";
// Writes the deterministic demo snapshot into app/.data/picks_snapshot.json so the
// real-mode UI and the scripts can be exercised locally without live data.
// Usage: node scripts/generate_demo_snapshot.mjs
import { SNAPSHOT_PATH } from "../app/server/paths.ts";
import { writeJson } from "../app/server/store.ts";

const snapshot = demoSnapshot("overview");
snapshot.source = "kelly-picks";
snapshot.demo_scenario = undefined;

await writeJson(SNAPSHOT_PATH, snapshot);
console.log(`Wrote ${SNAPSHOT_PATH}`);
