#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { ensureDirs } from "../../lib/common.ts";
import { defaultHost, defaultPort } from "../../lib/paths.ts";
import { app } from "./hono.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to other fetch-based runtimes unchanged once the data layer is
// cloud-backed.

const host = process.env.KELLY_WRITER_UI_HOST || process.env.KELLY_CONTENT_UI_HOST || defaultHost;
const port = Number.parseInt(
  process.env.KELLY_WRITER_UI_PORT || process.env.KELLY_CONTENT_UI_PORT || process.env.PORT || String(defaultPort),
  10,
);

await ensureDirs();

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Writer UI: http://${host}:${info.port}/`);
});
