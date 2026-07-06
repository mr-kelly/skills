import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { APP_DIR } from "../../lib/paths.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider, so the same app
// runs under @hono/node-server locally and — once the data layer moves to a
// cloud provider — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly Standup data provider: ${provider.kind}`);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await provider.getState(), 200, {
    "cache-control": "no-store",
  });
});

app.post("/api/decision", async (c) => {
  const lock = await provider.getLock();
  if (lock) {
    return c.json({ error: "Agent lock present; decisions are read-only right now.", lock }, 423, {
      "cache-control": "no-store",
    });
  }
  const raw = await c.req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400, { "cache-control": "no-store" });
  }
  const result = await provider.saveDecision({
    id: String(payload.id || ""),
    action: String(payload.action || ""),
    note: payload.note,
    draft: payload.draft,
  });
  if (!result.ok) {
    return c.json({ error: result.error }, (result.status || 400) as any, { "cache-control": "no-store" });
  }
  return c.json(await provider.getState(), 200, { "cache-control": "no-store" });
});

// ---- Static (vanilla frontend) ----
// Generic catch-all: serve any file under APP_DIR ("/" -> index.html), blocking
// paths that resolve inside .data/ or escape APP_DIR.
app.get("*", async (c) => {
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
