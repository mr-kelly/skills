#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { envSearchPaths, loadDotenvFiles } from "../../lib/data-provider/common.ts";
import { createProvider } from "../../lib/data-provider/index.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "../../lib/paths.ts";
import { app } from "./hono.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to Cloudflare Workers unchanged once the data layer is cloud-backed.

const host = process.env.KELLY_MESSENGER_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_MESSENGER_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await (await createProvider()).ensureReady();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Messenger UI: http://${host}:${info.port}`);
});
