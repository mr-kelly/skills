#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { defaultHost, defaultPort } from "../../lib/paths.mjs";
import { ensureDirs } from "../../lib/common.mjs";
import { app } from "./hono.mjs";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to other fetch-based runtimes unchanged once the data layer is
// cloud-backed.

const host = process.env.KELLY_CONTENT_UI_HOST || defaultHost;
const port = Number.parseInt(process.env.KELLY_CONTENT_UI_PORT || process.env.PORT || String(defaultPort), 10);

await ensureDirs();

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Content UI: http://${host}:${info.port}/`);
});
