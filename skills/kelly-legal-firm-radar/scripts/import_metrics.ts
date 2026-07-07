#!/usr/bin/env node
import { acquireLock, mergePayload, readJson, releaseLock, writeSnapshot } from "../lib/common.ts";
import { APP_TITLE } from "../lib/types.ts";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node scripts/import_metrics.ts payload.json [more.json ...]");
  process.exit(1);
}

await acquireLock(`Merging ${APP_TITLE} payload`);
try {
  let merged = null;
  for (const file of files) {
    const payload = await readJson(file, null);
    if (!payload || typeof payload !== "object") throw new Error(`Invalid payload: ${file}`);
    merged = await mergePayload(payload);
  }
  if (merged) await writeSnapshot(merged);
  console.log(`Merged ${files.length} payload file(s) into ${APP_TITLE}`);
} finally {
  await releaseLock();
}
