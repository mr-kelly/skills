#!/usr/bin/env node
import { readConfig } from "../lib/config.ts";
import { createLocalFileProvider, demoSnapshot } from "../lib/data-provider/local-file-provider.ts";

// Always use the local provider explicitly. This script must remain offline even
// when config.local.json selects the Busabase provider.
const configResult = await readConfig();
const provider = createLocalFileProvider(configResult);
const snapshot = demoSnapshot() as unknown as Record<string, unknown>;
snapshot.generated_at = new Date().toISOString();

const result = await provider.writeSnapshot(snapshot);
console.log(`Wrote demo insurance snapshot via explicit local provider: ${JSON.stringify(result)}`);
