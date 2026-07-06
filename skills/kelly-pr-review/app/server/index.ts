#!/usr/bin/env node
import fs from "node:fs/promises";
import { serve } from "@hono/node-server";
import { loadDotenvFiles } from "../../lib/data-reader/local-file-reader.ts";
import { app } from "./hono.ts";
import { BATCH_DIR, CACHE_DIR, DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to Cloudflare Workers unchanged once the data layer is cloud-backed.

const host = process.env.KELLY_PR_REVIEW_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_PR_REVIEW_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await fs.mkdir(CACHE_DIR, { recursive: true });
await fs.mkdir(BATCH_DIR, { recursive: true });
await loadDotenvFiles();

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly PR Review UI: http://${host}:${info.port}`);
});
