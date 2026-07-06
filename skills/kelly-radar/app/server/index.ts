#!/usr/bin/env node
import fs from "node:fs/promises";
import { serve } from "@hono/node-server";
import { DATA_DIR } from "../../lib/paths.ts";
import { app } from "./hono.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.ts";

const host = process.env.KELLY_RADAR_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_RADAR_UI_PORT || process.env.PORT || String(DEFAULT_PORT), 10);

// createProvider() (invoked when hono.ts is imported) already loads dotenv files
// and config; here we only ensure the local data dir exists.
await fs.mkdir(DATA_DIR, { recursive: true });

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Radar UI: http://${host}:${info.port}`);
});
