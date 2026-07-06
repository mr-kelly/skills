#!/usr/bin/env node
import fs from "node:fs/promises";
import { serve } from "@hono/node-server";
import { envSearchPaths, loadDotenvFiles } from "../../lib/config.ts";
import { DATA_DIR, DEFAULT_HOST, DEFAULT_PORT } from "../../lib/paths.ts";
import { app } from "./hono.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to other fetch-based runtimes unchanged once the data layer is
// cloud-backed (KELLY_CREATORS_DATA_PROVIDER=busabase).

const host = process.env.KELLY_CREATORS_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_CREATORS_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await fs.mkdir(DATA_DIR, { recursive: true });
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Creators UI: http://${host}:${info.port}`);
});
