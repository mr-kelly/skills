#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "../../lib/common.ts";
import { DEFAULT_HOST, DEFAULT_PORT } from "../../lib/paths.ts";
import { ENV_PREFIX } from "../../lib/types.ts";
import { app } from "./hono.ts";

const host = process.env[`${ENV_PREFIX}_UI_HOST`] || DEFAULT_HOST;
const port = Number.parseInt(process.env[`${ENV_PREFIX}_UI_PORT`] || process.env.PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`${ENV_PREFIX} UI: http://${host}:${info.port}`);
});
