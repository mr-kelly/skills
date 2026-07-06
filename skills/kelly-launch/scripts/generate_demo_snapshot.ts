#!/usr/bin/env node
import { demoStatePayload } from "../app/server/demo.ts";
// Seeds the local launch snapshot from the built-in demo payload, so a fresh
// checkout has something to review. Writes through the data-provider (local
// only) rather than touching app/.data directly.
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();
if (!provider.writeSnapshot) {
  console.error(`Provider "${provider.kind}" cannot seed a snapshot; run with the local provider.`);
  process.exit(1);
}

const snapshot = demoStatePayload({ demo: "overview" }).snapshot as Record<string, unknown>;
snapshot.generated_at = new Date().toISOString();
snapshot.source = "kelly-launch-demo";

await provider.writeSnapshot(snapshot);
console.log("Wrote launch snapshot via the local data provider.");
