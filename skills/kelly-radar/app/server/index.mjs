#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { app } from "./hono.mjs";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.mjs";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "./store.mjs";

const host = process.env.KELLY_RADAR_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_RADAR_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Radar UI: http://${host}:${info.port}`);
});
