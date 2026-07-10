#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { ensureDirs } from "../../lib/common.ts";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";

// Local runtime: run the platform-neutral Hono app on Node. The same app.fetch
// deploys to Cloudflare Workers unchanged once the data layer is cloud-backed.

const host = process.env.KELLY_AGENT_EVAL_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_AGENT_EVAL_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Agent Eval & Regression Board: http://${host}:${info.port}`);
});
