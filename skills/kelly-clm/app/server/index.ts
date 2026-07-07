#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { app } from "./hono.ts";

const host = process.env.KELLY_CLM_UI_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.KELLY_CLM_UI_PORT || process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly CLM UI: http://${host}:${info.port}`);
});
