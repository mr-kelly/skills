#!/usr/bin/env node
import { createProvider } from "../lib/data-provider/index.ts";
import { demoSnapshot } from "../lib/data-provider/local-file-provider.ts";

const provider = await createProvider();
const snapshot = demoSnapshot() as unknown as Record<string, unknown>;
snapshot.generated_at = new Date().toISOString();

if (!provider.writeSnapshot) {
  throw new Error(`Provider "${provider.name}" cannot write snapshots.`);
}

const result = await provider.writeSnapshot(snapshot);
console.log(`Wrote demo insurance snapshot via "${provider.name}" provider: ${JSON.stringify(result)}`);
