#!/usr/bin/env node
// Single write-path for agent-collected signal payloads.
// Usage: node scripts/ingest_signals.ts <payload.json>
// Payload: { "collected_at": "ISO", "signals": [ { target_id, source_id, source_kind, headline, summary, ... } ] }
import fs from "node:fs/promises";
import { createProvider } from "../lib/data-provider/index.ts";

function fail(message: string): never {
  console.error(`ingest_signals failed: ${message}`);
  process.exit(1);
}

const payloadPath = process.argv[2];
if (!payloadPath) fail("usage: node scripts/ingest_signals.ts <payload.json>");

let payload: any;
try {
  payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
} catch (error) {
  fail(`cannot read ${payloadPath}: ${(error as Error).message}`);
}

const provider = await createProvider();
try {
  const result = await provider.ingestSignals(payload);
  console.log(
    `OK: ${result.added} added, ${result.skipped} duplicates skipped → ${result.snapshot_path} (provider: ${provider.name})`,
  );
} catch (error) {
  fail((error as Error).message);
}
