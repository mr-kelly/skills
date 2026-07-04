#!/usr/bin/env node
// Writes the deterministic demo snapshot into app/.data/seo_snapshot.json so the
// UI and validator can be exercised without GSC credentials. Uses the same
// builder as the in-memory demo scenes.

import { buildDemoSnapshot } from "../app/server/demo.mjs";
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { ensureDirs, writeJson } from "../app/server/store.mjs";

await ensureDirs();
const snapshot = buildDemoSnapshot();
snapshot.generated_at = new Date().toISOString();
await writeJson(SNAPSHOT_PATH, snapshot);
console.log(`Wrote ${SNAPSHOT_PATH}`);
console.log(
  `Sites: ${snapshot.metrics.site_count}, queries: ${snapshot.metrics.query_count}, pages: ${snapshot.metrics.page_count}, opportunities: ${snapshot.metrics.opportunity_count}`,
);
