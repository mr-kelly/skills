#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "../../lib/data-provider/index.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to Cloudflare Workers unchanged once the data layer is cloud-backed.

const host = process.env.KELLY_MONEY_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_MONEY_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

// Import the app AFTER dotenv is loaded: hono.ts builds the data provider at
// module load, and the provider reads config + secret env vars that a dotenv
// file may supply (KELLY_MONEY_DATA_PROVIDER, KELLY_MONEY_BUSABASE_*, etc.).
const { app } = await import("./hono.ts");

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Money UI: http://${host}:${info.port}`);
});
