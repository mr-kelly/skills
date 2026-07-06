#!/usr/bin/env node
// Writes the deterministic Brightway Trading demo snapshot into
// app/.data/audit_snapshot.json so the app has believable local data without
// touching any real business documents. Safe to re-run; honors nothing but
// the local file system.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoSnapshot } from "../app/server/demo.ts";
import { createProvider } from "../lib/data-provider/index.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const provider = await createProvider();
await provider.ensureReady();
const snapshot = buildDemoSnapshot();
snapshot.source = "kelly-audit-demo";
await provider.writeSnapshot(snapshot);
console.log(`Wrote the ${provider.name} demo audit snapshot`);
console.log(
  `  orders=${snapshot.orders.length} invoices=${snapshot.invoices.length} payments=${snapshot.payments.length} anomalies=${snapshot.anomalies.length}`,
);
console.log(`Validate with: node ${path.join(skillDir, "scripts", "validate_ui_schema.ts")}`);
