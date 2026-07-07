#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "../../lib/common.ts";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";

const host = process.env.KELLY_INVOICE_SHEET_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_INVOICE_SHEET_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Invoice Sheet UI: http://${host}:${info.port}`);
});
