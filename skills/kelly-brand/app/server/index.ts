#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "../../lib/data-provider/index.ts";
import { defaultHost, defaultPort } from "../../lib/paths.ts";
import { app } from "./hono.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to Cloudflare Workers unchanged once the data layer is cloud-backed.

const host = process.env.KELLY_BRAND_UI_HOST || defaultHost;
const port = Number.parseInt(process.env.KELLY_BRAND_UI_PORT || process.env.PORT || String(defaultPort), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Brand UI: http://${host}:${info.port}`);
});
