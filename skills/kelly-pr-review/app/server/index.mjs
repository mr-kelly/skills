#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { loadDotenvFiles } from "../../lib/data-reader/local-file-reader.mjs";
import { ensureDirs } from "./batch-store.mjs";
import { app } from "./hono.mjs";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.mjs";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to Cloudflare Workers unchanged once the data layer is cloud-backed.

const host = process.env.KELLY_PR_REVIEW_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_PR_REVIEW_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles();

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly PR Review UI: http://${host}:${info.port}`);
});
