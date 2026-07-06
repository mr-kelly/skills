import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { demoDecisionResponse, demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR, TEST_EVIDENCE_DIR } from "./paths.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider (createProvider()
// -> local | busabase), so the same app runs under @hono/node-server locally and
// — once the data layer moves to a cloud provider — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly PR Review data provider: ${provider.kind}`);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

async function sendFile(c, absPath) {
  let body: Buffer;
  try {
    body = await fs.readFile(absPath);
  } catch {
    return c.text("Not Found", 404);
  }
  return c.body(body as unknown as ArrayBuffer, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(absPath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
}

export const app = new Hono();

// ---- HEAD (readiness probes) ----
for (const p of ["/", "/app.js", "/styles.css", "/api/state", "/api/lock"]) {
  app.on("HEAD", p, (c) => c.body(null, 200));
}

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await provider.getState(query));
});

app.get("/api/lock", async (c) => {
  const query = c.req.query();
  return c.json({ lock: isDemoQuery(query) ? { locked: false } : await provider.getLock() });
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query)) return c.json(demoDecisionResponse(body));
  return c.json(await provider.saveDecision(body));
});

app.post("/api/detail", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query)) return c.json(demoDecisionResponse(body));
  return c.json(await provider.saveDetail(body));
});

app.post("/api/tested", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query)) return c.json(demoDecisionResponse(body));
  return c.json(await provider.setTested(body.id, body.tested, { note: body.note, evidence: body.evidence }));
});

app.post("/api/reload", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await provider.getState({}));
});

// ---- Static (vanilla frontend) ----
app.get("/", (c) => sendFile(c, path.join(APP_DIR, "index.html")));
app.get("/app.js", (c) => sendFile(c, path.join(APP_DIR, "app.js")));
app.get("/styles.css", (c) => sendFile(c, path.join(APP_DIR, "styles.css")));

app.get("/i18n/*", (c) => {
  const relative = decodeURIComponent(c.req.path.replace(/^\/i18n\//, ""));
  const resolved = path.resolve(APP_DIR, "i18n", relative);
  if (!resolved.startsWith(path.resolve(APP_DIR, "i18n") + path.sep) || path.extname(resolved) !== ".js") {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});

// Test evidence lives on disk under .data/, served with a path-traversal guard.
app.get("/test-evidence/*", (c) => {
  const relative = decodeURIComponent(c.req.path.replace(/^\/test-evidence\//, ""));
  const resolved = path.resolve(TEST_EVIDENCE_DIR, relative);
  if (!resolved.startsWith(path.resolve(TEST_EVIDENCE_DIR) + path.sep)) {
    return c.text("Forbidden", 403);
  }
  return sendFile(c, resolved);
});

// Methods other than HEAD/GET/POST were answered with 405 by the original
// node:http router; GET/POST paths that don't match fall through to 404.
app.all("*", (c) => {
  if (c.req.method === "GET" || c.req.method === "POST" || c.req.method === "HEAD") {
    return c.text("Not Found", 404);
  }
  return c.text("Method Not Allowed", 405);
});

app.onError((err, c) => c.json({ error: err.message, trace: err.stack }, 500));
