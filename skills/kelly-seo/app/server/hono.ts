import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider layer (lib/data-
// provider), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly SEO data provider: ${provider.kind}`);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function jsonResponse(c, status, body) {
  return c.body(JSON.stringify(body), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
}

async function state() {
  return {
    app: "kelly-seo",
    data_provider: provider.kind,
    ...(await provider.getState()),
  };
}

export const app = new Hono();
app.use("/api/state", attachDemoVisuals);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return jsonResponse(c, 200, isDemoQuery(query) ? demoStatePayload(query) : await state());
});

app.post("/api/decision", async (c) => {
  const lock = await provider.getLock();
  if (lock) {
    return jsonResponse(c, 409, { error: "Agent lock present; decisions are read-only right now.", lock });
  }
  const raw = await c.req.text();
  let payload: any;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return jsonResponse(c, 400, { error: "Invalid JSON body" });
  }
  const result = await provider.saveDecision({
    id: String(payload.id || ""),
    action: String(payload.action || ""),
    note: payload.note,
    draft: payload.draft,
  });
  if (!result.ok) {
    return jsonResponse(c, result.status || 400, { error: result.error });
  }
  return jsonResponse(c, 200, await state());
});

// A human verdict on one GEO content-optimization opportunity. geo-qa BLOCKs are
// rejected by the provider (422) before they can be approved.
app.post("/api/geo-decision", async (c) => {
  const lock = await provider.getLock();
  if (lock) {
    return jsonResponse(c, 409, { error: "Agent lock present; decisions are read-only right now.", lock });
  }
  const raw = await c.req.text();
  let payload: any;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return jsonResponse(c, 400, { error: "Invalid JSON body" });
  }
  const result = await provider.saveGeoDecision({
    id: String(payload.id || ""),
    action: String(payload.action || ""),
    note: payload.note,
    draft: payload.draft,
  });
  if (!result.ok) {
    return jsonResponse(c, result.status || 400, { error: result.error });
  }
  return jsonResponse(c, 200, await state());
});

// Update one entity-readiness signal's status/note.
app.post("/api/entity-signal", async (c) => {
  const lock = await provider.getLock();
  if (lock) {
    return jsonResponse(c, 409, { error: "Agent lock present; decisions are read-only right now.", lock });
  }
  const raw = await c.req.text();
  let payload: any;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return jsonResponse(c, 400, { error: "Invalid JSON body" });
  }
  const result = await provider.updateEntitySignal({
    id: String(payload.id || ""),
    status: String(payload.status || ""),
    note: payload.note,
  });
  if (!result.ok) {
    return jsonResponse(c, result.status || 400, { error: result.error });
  }
  return jsonResponse(c, 200, await state());
});

// ---- Static (vanilla frontend) ----
async function serveStatic(c) {
  const pathname = decodeURIComponent(c.req.path === "/" ? "/index.html" : c.req.path);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
  try {
    const data = await fs.readFile(filePath);
    return c.body(data, 200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
  } catch {
    return c.text("Not found", 404);
  }
}

app.all("*", (c) => serveStatic(c));

app.onError((err, c) => jsonResponse(c, 500, { error: err.message }));
