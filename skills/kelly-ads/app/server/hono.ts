import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import { applyDecision, readConfig, readLock, readOnboarding, readSnapshot, summarizeConfig } from "./store.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through store.mjs (data-provider backed), so
// the same app runs under @hono/node-server locally and — once the data layer
// moves to a cloud provider — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function state() {
  const [snapshot, onboarding, lock, configResult] = await Promise.all([
    readSnapshot(),
    readOnboarding(),
    readLock(),
    readConfig(),
  ]);
  return {
    app: "kelly-ads",
    data_provider: process.env.KELLY_ADS_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    snapshot,
  };
}

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await state();
  return c.json(body, 200, { "cache-control": "no-store" });
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  if (isDemoQuery(query)) {
    return c.json({ demo: true, saved: false, message: "Demo mode never writes local files." }, 200, {
      "cache-control": "no-store",
    });
  }
  const raw = await c.req.text();
  let payload: Record<string, any>;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400, { "cache-control": "no-store" });
  }
  try {
    const result = await applyDecision(payload);
    return c.json({ saved: true, adjustment: result.adjustment, decision: result.decision }, 200, {
      "cache-control": "no-store",
    });
  } catch (error) {
    return c.json({ error: error.message }, /** @type {any} */ (error.code === "LOCKED" ? 423 : 400), {
      "cache-control": "no-store",
    });
  }
});

// ---- Static (vanilla frontend) ----
// Generic catch-all: serve any file under APP_DIR ("/" -> index.html), blocking
// paths that resolve inside .data/ or escape APP_DIR.
app.all("*", async (c) => {
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
