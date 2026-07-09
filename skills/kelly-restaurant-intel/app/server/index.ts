#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT, DISPLAY_NAME } from "./paths.ts";
import { ensureDirs } from "./store.ts";

await ensureDirs();
serve({ fetch: app.fetch, hostname: DEFAULT_HOST, port: DEFAULT_PORT }, (info) => {
  console.log(`${DISPLAY_NAME} UI: http://${DEFAULT_HOST}:${info.port}`);
});
