#!/usr/bin/env node
// Writes the deterministic demo snapshot to app/.data/radar_snapshot.json for local
// testing and validation. Never touches live data sources.
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { demoSnapshot } from "../app/server/demo.mjs";
import { writeJson } from "../app/server/store.mjs";

const snapshot = demoSnapshot("overview");
delete snapshot.demo_scenario;
snapshot.source = "kelly-radar-demo";

await writeJson(SNAPSHOT_PATH, snapshot);
console.log(`Wrote ${SNAPSHOT_PATH}`);
