#!/usr/bin/env node
// Writes the deterministic Brightway Trading demo snapshot into
// app/.data/audit_snapshot.json so the app has believable local data without
// touching any real business documents. Safe to re-run; honors nothing but
// the local file system.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoSnapshot } from "../app/server/demo.mjs";
import { ensureDirs, writeJson } from "../app/server/store.mjs";
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await ensureDirs();
const snapshot = buildDemoSnapshot();
snapshot.source = "kelly-audit-demo";
await writeJson(SNAPSHOT_PATH, snapshot);
console.log(`Wrote ${SNAPSHOT_PATH}`);
console.log(`  orders=${snapshot.orders.length} invoices=${snapshot.invoices.length} payments=${snapshot.payments.length} anomalies=${snapshot.anomalies.length}`);
console.log(`Validate with: node ${path.join(skillDir, "scripts", "validate_ui_schema.mjs")}`);
