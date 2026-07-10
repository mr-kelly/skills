#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "./store.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// could deploy elsewhere unchanged once the data layer is cloud-backed.

const host = process.env.KELLY_AGENT_OBS_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_AGENT_OBS_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Agent Fleet Observability Desk UI: http://${host}:${info.port}`);
});
