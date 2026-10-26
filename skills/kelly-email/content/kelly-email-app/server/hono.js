import fs from "node:fs/promises";
import path from "node:path";
import { describeBusabaseAirAppRuntime } from "busabase-sdk/airapp-node";
import { Hono } from "hono";
import { attachDemoVisuals } from "./demo-visuals.js";
import { demoDecisionResponse, demoStatePayload } from "./demo.js";
import { installLocalBusabaseAuth } from "./local-auth.js";
import { APP_DIR } from "./paths.js";

/**
 * What this process is, and is not.
 *
 * It serves the app's files, tells the page which runtime it is in, answers the
 * `?demo=` fixture, and — standalone only — proxies `/api/v1` with the credential
 * it holds. It never reads the workspace itself. A Busabase-hosted AirApp process
 * is given `BUSABASE_AIRAPP_RUNTIME` and nothing else — no API origin, no
 * credential — so the page's own same-origin `/api/v1` is the only route to the
 * data, and the page does every read and write (`app/js/data/page-api.js`).
 */

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip",
};

async function sendFile(c, absPath, { store = false } = {}) {
  let body;
  try {
    body = await fs.readFile(absPath);
  } catch {
    return c.text("Not Found", 404);
  }
  return c.body(body, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(absPath)] || "application/octet-stream",
    "Cache-Control": store ? "public, max-age=3600" : "no-store",
  });
}

export const app = new Hono();
// Standalone, adds the connect gate and the `/api/v1` proxy that attaches the
// credential and the operator's confirmed Space. Hosted, the page's `/api/v1` is
// Busabase's own and none of these routes are reached.
installLocalBusabaseAuth(app, { appId: "kelly-email" });

// The SDK owns the runtime vocabulary and, critically, decides hosting from
// presence of BUSABASE_AIRAPP_RUNTIME rather than membership in a stale list.
app.get("/__airapp/runtime", (c) => c.json(describeBusabaseAirAppRuntime()));

// ---- Demo fixture ----
// `?demo=<scenario>` shows sample mail without any Busabase connection. Real
// data never passes through here; the page reads and writes it over `/api/v1`.
app.use("/api/state", attachDemoVisuals);
app.get("/api/state", (c) => c.json(demoStatePayload(c.req.query())));
app.get("/api/lock", (c) => c.json({ lock: { locked: false } }));
app.post("/api/decision", async (c) => c.json(demoDecisionResponse(await c.req.json().catch(() => ({})))));
app.post("/api/detail", async (c) => c.json(demoDecisionResponse(await c.req.json().catch(() => ({})))));

// ---- Static (vanilla frontend) ----
app.get("/", (c) => sendFile(c, path.join(APP_DIR, "index.html")));
app.get("/app.js", (c) => sendFile(c, path.join(APP_DIR, "app.js")));
app.get("/demo-visuals.js", (c) => sendFile(c, path.join(APP_DIR, "demo-visuals.js")));
app.get("/demo-visuals.css", (c) => sendFile(c, path.join(APP_DIR, "demo-visuals.css")));
// Split into cascade-layered files (base/components/shell/setup-wizard/
// help-modal/list-detail) — see frontend-modules.md. @layer precedence
// makes the <link> order below irrelevant to which rule wins.
app.get("/styles/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/styles\//, ""));
  const resolved = path.resolve(APP_DIR, "styles", rel);
  if (!resolved.startsWith(path.resolve(APP_DIR, "styles") + path.sep) || path.extname(resolved) !== ".css") {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});

app.get("/i18n/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/i18n\//, ""));
  const resolved = path.resolve(APP_DIR, "i18n", rel);
  if (!resolved.startsWith(path.resolve(APP_DIR, "i18n") + path.sep) || path.extname(resolved) !== ".js") {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});

// Frontend components (plain ES modules, no bundler): app.js imports these
// with relative "./js/*.js" specifiers, so the browser requests them here.
app.get("/js/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/js\//, ""));
  const resolved = path.resolve(APP_DIR, "js", rel);
  if (!resolved.startsWith(path.resolve(APP_DIR, "js") + path.sep) || path.extname(resolved) !== ".js") {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});

// The vendored busabase-sdk bundle the page's data layer imports.
app.get("/vendor/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/vendor\//, ""));
  const resolved = path.resolve(APP_DIR, "vendor", rel);
  if (!resolved.startsWith(path.resolve(APP_DIR, "vendor") + path.sep) || path.extname(resolved) !== ".js") {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved, { store: true });
});

app.onError((err, c) => {
  console.error("Kelly Email request failed", err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});
