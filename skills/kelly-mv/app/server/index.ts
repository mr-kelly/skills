#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";
import { ensureProject } from "./project-store.ts";
import { provider } from "./provider.ts";

const host = process.env.KELLY_MV_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_MV_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

console.log(`Kelly MV data provider: ${provider.name}`);
await ensureProject();

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly MV UI: http://${host}:${info.port}`);
});
