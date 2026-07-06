#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { envSearchPaths, loadDotenvFiles } from "../../lib/common.ts";
import { ensureDirs } from "../../lib/data-provider/local-file-provider.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "../../lib/paths.ts";
import { app } from "./hono.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to other fetch-based runtimes unchanged once the data layer is cloud-backed.

const host = process.env.KELLY_FEEDBACK_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_FEEDBACK_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Feedback UI: http://${host}:${info.port}`);
});
