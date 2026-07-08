import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createProvider } from "../../lib/data-provider/index.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider, so the same app
// runs under @hono/node-server locally and — once the data layer moves to a
// cloud provider like Busabase — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly Social data provider: ${provider.kind}`);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function state() {
  return { app: "kelly-social", ...(await provider.getState()) };
}

export const app = new Hono();
app.use("/api/state", attachDemoVisuals);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await state();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

// ECHO publishing desk: apply one review decision / publish / reply / crisis
// toggle. Local writes only — the skill performs the real platform action out
// of band after approval. Demo mode never mutates real state; it just echoes
// back a synthetic ok so the UI can show the optimistic transition.
app.post("/api/operation", async (c) => {
  const query = c.req.query();
  const op = await c.req.json().catch(() => null);
  if (!op || typeof op !== "object" || typeof op.operation !== "string") {
    return c.json({ error: "Body must be a JSON object with an 'operation' field." }, 400);
  }
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, operation: op.operation }, 200);
  }
  try {
    const snapshot = await provider.applyOperation(op);
    return c.body(JSON.stringify({ ok: true, operation: op.operation, snapshot }), 200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
  } catch (error) {
    const status = ((error as { statusCode?: number }).statusCode || 500) as ContentfulStatusCode;
    return c.json({ error: (error as Error).message }, status);
  }
});

// ---- Static (vanilla frontend) ----
// Catch-all with the same guard as the original node:http server: resolve the
// request path under APP_DIR, refuse anything that escapes APP_DIR or reaches
// into .data/, map "/" -> index.html, and 404 on missing files.
app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
  try {
    const data = await fs.readFile(filePath);
    return c.body(data, 200, {
      "content-type": types[path.extname(filePath)] || "application/octet-stream",
    });
  } catch {
    return c.text("Not found", 404);
  }
});

app.onError((err, c) => c.json({ error: err.message }, 500));
