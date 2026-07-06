import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (data-provider
// backed), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider — on Cloudflare Workers.
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

function json(c, status, body) {
  return c.body(JSON.stringify(body), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
}

async function state() {
  const provider = await createProvider();
  return provider.getState();
}

async function serveStatic(c) {
  const pathname = decodeURIComponent(c.req.path === "/" ? "/index.html" : c.req.path);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.body("Forbidden", 403);
  }
  try {
    const data = await fs.readFile(filePath);
    return c.body(data, 200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
  } catch {
    return c.body("Not found", 404);
  }
}

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return json(c, 200, isDemoQuery(query) ? demoStatePayload(query) : await state());
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  if (isDemoQuery(query)) {
    return json(c, 200, { demo: true, saved: false, message: "Demo mode never writes local files." });
  }
  let body: Record<string, unknown>;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json(c, 400, { error: "Invalid JSON body" });
  }
  try {
    const provider = await createProvider();
    const result = await provider.applyDecision(body);
    return json(c, 200, { saved: true, action: result.action, decision: result.decision });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return json(c, err.code === "LOCKED" ? 423 : 400, { error: err.message });
  }
});

// ---- Static (vanilla frontend) ----
app.all("*", (c) => serveStatic(c));

app.onError((err, c) => c.json({ error: err.message }, 500));
