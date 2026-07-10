#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";
import { ensureDirs } from "./store.ts";

const host = process.env.KELLY_BEHAVIOR_PREDICT_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(
  process.env.KELLY_BEHAVIOR_PREDICT_UI_PORT || process.env.PORT || String(DEFAULT_PORT),
  10,
);

await ensureDirs();

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Predictive Recommendation Analytics Desk UI: http://${host}:${info.port}`);
});
