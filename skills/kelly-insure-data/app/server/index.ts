#!/usr/bin/env node
import fs from "node:fs/promises";
import { serve } from "@hono/node-server";
import { envSearchPaths, loadDotenvFiles } from "../../lib/config.ts";
import { DATA_DIR, DEFAULT_HOST, DEFAULT_PORT } from "../../lib/paths.ts";
import { app } from "./hono.ts";

const host = process.env.KELLY_INSURE_DATA_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_INSURE_DATA_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await fs.mkdir(DATA_DIR, { recursive: true });
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Insure Data UI: http://${host}:${info.port}`);
});
