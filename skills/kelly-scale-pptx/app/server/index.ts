#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "./store.ts";

const host = process.env.KELLY_SCALE_PPTX_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_SCALE_PPTX_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Scale PPTX UI: http://${host}:${info.port}`);
});
