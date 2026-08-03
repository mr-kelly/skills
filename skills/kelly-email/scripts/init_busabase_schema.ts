#!/usr/bin/env node
import { createProvider, loadDotenv } from "../app/lib/data-provider/index.ts";

function help() {
  console.log(`Usage: node scripts/init_busabase_schema.ts [--apply]

Checks the declared Kelly Email Busabase Folder, Bases, and Drive.
Without --apply this is read-only. With --apply it lazily creates missing
declared resources after ownership checks. Normal AirApp startup does the same.`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    help();
    return 0;
  }
  await loadDotenv();
  const provider = createProvider();
  const apply = args.has("--apply");
  const result = provider.ensureSchema
    ? await provider.ensureSchema({ apply })
    : { ok: false, error: "provider has no ensureSchema()" };
  console.log(JSON.stringify({ apply, ...result }, null, 2));
  return result.ok || !apply ? 0 : 1;
}

process.exitCode = await main();
