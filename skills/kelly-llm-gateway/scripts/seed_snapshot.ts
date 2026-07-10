#!/usr/bin/env node
// Seed script: writes a deterministic gateway snapshot to app/.data/snapshot.json
// so the local app has something to render on first run. Fully offline — no
// network calls, no Math.random. Re-running reproduces the same file.

import { computeAnomalies } from "../app/server/anomalies.ts";
import { writeJson } from "../lib/common.ts";
import { buildSnapshot } from "../lib/data-provider/seed-data.ts";
import { SNAPSHOT_PATH } from "../lib/paths.ts";

const snapshot = buildSnapshot();
snapshot.anomalies = computeAnomalies(snapshot);

await writeJson(SNAPSHOT_PATH, snapshot);
console.log(`Wrote ${SNAPSHOT_PATH}`);
console.log(`  routes: ${snapshot.routes.length}, anomalies: ${snapshot.anomalies.length}`);
