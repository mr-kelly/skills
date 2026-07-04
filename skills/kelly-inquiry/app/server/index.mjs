#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.mjs";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "./store.mjs";
import { app } from "./hono.mjs";

const host = process.env.KELLY_INQUIRY_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_INQUIRY_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Inquiry UI: http://${host}:${info.port}`);
});
