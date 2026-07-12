import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoState } from "./demo.ts";
import { installSetup } from "./setup.ts";
import { readDecisions, readLock, saveDecision } from "./store.ts";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

export const app = new Hono();
installSetup(app);
app.use("/api/state", attachDemoVisuals);

app.get("/api/state", async (c) =>
  c.json({
    ...demoState(Object.fromEntries(new URL(c.req.url).searchParams)),
    decisions: await readDecisions(),
    lock: await readLock(),
  }),
);
app.post("/api/decision", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  return c.json({ ok: true, decision: await saveDecision(body) });
});

app.onError((error, c) =>
  c.json({ error: error.message }, ("statusCode" in error ? Number(error.statusCode) : 500) as 500),
);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

async function fileResponse(path, fallback = false) {
  const file = fallback ? join(appDir, "index.html") : join(appDir, path.replace(/^\/+/, ""));
  const body = await readFile(file);
  const ext = file.slice(file.lastIndexOf("."));
  return new Response(body, { headers: { "content-type": contentTypes[ext] || "application/octet-stream" } });
}

app.get("/", () => fileResponse("index.html"));
app.get("/app.js", () => fileResponse("app.js"));
app.get("/styles.css", () => fileResponse("styles.css"));
app.get("/accent-theme.js", () => fileResponse("accent-theme.js"));
app.get("/accent-theme.css", () => fileResponse("accent-theme.css"));
app.get("/demo-visuals.js", () => fileResponse("demo-visuals.js"));
app.get("/demo-visuals.css", () => fileResponse("demo-visuals.css"));
app.get("/i18n/messages.js", () => fileResponse("i18n/messages.js"));
app.get("*", () => fileResponse("index.html", true));
