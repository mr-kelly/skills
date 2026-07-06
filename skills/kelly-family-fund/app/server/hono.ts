import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { computeInsights } from "./insights.ts";
import { APP_DIR } from "./paths.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (data-provider
// backed), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider like Busabase — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything. This is a read-only bookkeeping dashboard:
// it never moves money.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const provider = await createProvider();
console.log(`Kelly Family Fund data provider: ${provider.kind}`);

async function state() {
  const [providerState, configResult] = await Promise.all([provider.getState(), provider.getConfig()]);
  const snapshot = providerState.snapshot;
  // Attach read-only, rule-based insights at read time so CSV-sourced and
  // script-generated snapshots (which do not persist insights) both surface them.
  snapshot.insights = computeInsights(snapshot, configResult.config?.fairness?.deviation_threshold_pct);
  return {
    app: "kelly-family-fund",
    data_provider: providerState.data_provider,
    onboarding: providerState.onboarding,
    lock: providerState.lock,
    config_summary: providerState.config_summary,
    snapshot,
  };
}

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await state();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

// ---- Static (vanilla frontend) ----
// Mirrors the original node:http serveStatic: normalize under APP_DIR, block
// .data/, "/" -> index.html, content-type by extension, 403 on escape, 404 on
// missing file.
app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data as unknown as ArrayBuffer, 200, {
    "content-type": types[path.extname(filePath)] || "application/octet-stream",
  });
});

app.onError((err, c) => c.json({ error: err.message }, 500));
