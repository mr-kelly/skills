import fs from "node:fs/promises";
import path from "node:path";
import { type Context, Hono } from "hono";
import { createProvider } from "../lib/data-provider/index.ts";
import { withRuntimeRequest } from "../lib/runtime-context.ts";
import { updateDetail, updateItems } from "./decisions.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoDecisionResponse, demoStatePayload, isDemoQuery } from "./demo.ts";
import { lockPayload } from "./lock.ts";
import { APP_DIR } from "./paths.ts";
import { statePayload } from "./state.ts";
import { installLocalBusabaseAuth } from "./local-auth.js";

// The AirApp server forwards its ambient Busabase session to busabase-sdk.

const CONTENT_TYPES: Record<string, string> = {
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

async function sendFile(c: Context, absPath: string, { store = false }: { store?: boolean } = {}) {
  let body: Buffer;
  try {
    body = await fs.readFile(absPath);
  } catch {
    return c.text("Not Found", 404);
  }
  return c.body(body as unknown as ArrayBuffer, 200, {
    "Content-Type": CONTENT_TYPES[path.extname(absPath)] || "application/octet-stream",
    "Cache-Control": store ? "public, max-age=3600" : "no-store",
  });
}

export const app = new Hono();
installLocalBusabaseAuth(app, { appId: "kelly-email" });
app.use("*", async (c, next) => {
  const headers: Record<string, string> = {};
  for (const name of ["cookie", "authorization"]) {
    const value = c.req.header(name);
    if (value) headers[name] = value;
  }
  return withRuntimeRequest({ origin: new URL(c.req.url).origin, headers }, next);
});
app.use("/api/state", attachDemoVisuals);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await statePayload(query));
});

app.get("/api/lock", async (c) => {
  const query = c.req.query();
  return c.json({ lock: isDemoQuery(query) ? { locked: false } : await lockPayload() });
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query)) return c.json(demoDecisionResponse(body));
  return c.json((await updateItems(body)) as any);
});

app.post("/api/detail", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query)) return c.json(demoDecisionResponse(body));
  return c.json((await updateDetail(body)) as any);
});

app.post("/api/reload", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await statePayload({}));
});

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

app.get("/api/provider-file/*", async (c) => {
  const pathname = decodeURIComponent(c.req.path.replace(/^\/api\/provider-file\//, ""));
  const provider = createProvider();
  if (!provider.getFile) return c.text("Not Found", 404);
  const file = await provider.getFile(pathname).catch(() => null);
  const data = file?.data;
  if (typeof data !== "string") return c.text("Not Found", 404);
  const meta = (file.meta && typeof file.meta === "object" ? file.meta : {}) as Record<string, unknown>;
  const buffer = Buffer.from(data, meta.encoding === "base64" ? "base64" : "utf8");
  return c.body(buffer as unknown as ArrayBuffer, 200, {
    "Content-Type": String(meta.content_type || "application/octet-stream"),
    "Cache-Control": "no-store",
  });
});

app.onError((err, c) => {
  console.error("Kelly Email request failed", err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});
