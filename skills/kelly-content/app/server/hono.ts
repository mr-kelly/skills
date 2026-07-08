import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { appDir } from "../../lib/paths.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoState, isDemoQuery } from "./demo.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider, so the same app
// runs under @hono/node-server locally and — once the data layer moves to a
// cloud provider — on other fetch-based runtimes.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly Content data provider: ${provider.kind}`);

// The original demo helpers read query params via URLSearchParams (.get). Rebuild
// one from the request URL so demo-mode detection and localization stay identical.
function searchParams(c) {
  return new URL(c.req.url).searchParams;
}

export const app = new Hono();
app.use("/api/state", attachDemoVisuals);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = searchParams(c);
  const state = isDemoQuery(query) ? demoState(query) : await provider.getState();
  return c.json({ app: "kelly-content", ...state });
});

app.post("/api/decision", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  const body = await c.req.json().catch(() => ({}));
  return c.json(await provider.saveDecision(body));
});

app.post("/api/confirm-direction", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  const body = await c.req.json().catch(() => ({}));
  return c.json(await provider.confirmDirection(body));
});

app.post("/api/start-todo", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  const body = await c.req.json().catch(() => ({}));
  return c.json(await provider.startTodo(body));
});

app.post("/api/export", async (c) => {
  const query = searchParams(c);
  if (isDemoQuery(query)) {
    return c.json({ ok: true, demo: true, message: "Demo mode: no local content files were changed." });
  }
  return c.json(await provider.exportApproved());
});

app.get("/api/agent-tasks", async (c) => {
  return c.json({ tasks: (await provider.listAgentTasks?.()) || [] });
});

// Any other /api/ path is a 404 JSON error (matches the inline handler).
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// ---- Static (vanilla frontend) ----
// Serve any non-API path from appDir. "/" maps to index.html and the same
// prefix guard keeps requests inside appDir (blocking traversal / .data access).
app.get("*", async (c) => {
  const urlPath = new URL(c.req.url).pathname;
  const clean = urlPath === "/" ? "/index.html" : urlPath;
  const file = path.normalize(path.join(appDir, clean));
  if (!file.startsWith(appDir)) return c.text("Forbidden", 403);
  const ext = path.extname(file);
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data as unknown as ArrayBuffer, 200, {
    "content-type": `${types[ext] || "application/octet-stream"}; charset=utf-8`,
  });
});

app.onError((err, c) => c.json({ error: err.message }, 500));
