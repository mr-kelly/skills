#!/usr/bin/env node
import { createProvider, loadDotenv } from "../lib/data-provider/index.ts";

if (!process.env.KELLY_EMAIL_DATA_PROVIDER && !process.env.KELLY_EMAIL_DATA_READER) {
  process.env.KELLY_EMAIL_DATA_PROVIDER = "busabase";
}

function help() {
  console.log(`Usage: KELLY_EMAIL_DATA_PROVIDER=busabase node scripts/init_busabase_schema.ts [--apply]

Checks the Kelly Email Busabase Base/Drive/Secrets schema metadata.
Without --apply, this is read-only. With --apply, it writes the schema_meta
record into the configured Busabase Base.`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    help();
    return 0;
  }
  await loadDotenv();
  const provider = createProvider();
  if (provider.kind !== "busabase") {
    throw new Error(`init_busabase_schema requires KELLY_EMAIL_DATA_PROVIDER=busabase, got ${provider.kind}`);
  }
  const apply = args.has("--apply");
  const result = provider.ensureSchema
    ? await provider.ensureSchema({ apply })
    : { ok: false, error: "provider has no ensureSchema()" };
  console.log(JSON.stringify({ apply, ...result }, null, 2));
  return result.ok || !apply ? 0 : 1;
}

process.exitCode = await main();
