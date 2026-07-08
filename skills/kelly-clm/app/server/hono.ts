import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoState } from "./demo.ts";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

export const app = new Hono();
app.use("/api/state", attachDemoVisuals);

app.get("/api/state", (c) => c.json(demoState(Object.fromEntries(new URL(c.req.url).searchParams))));
app.post("/api/decision", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({
    ok: true,
    demo: true,
    decision: {
      ...body,
      decided_at: new Date().toISOString(),
      note: "Demo mode keeps decisions in memory only.",
    },
  });
});

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
app.get("/i18n/messages.js", () => fileResponse("i18n/messages.js"));
app.get("*", () => fileResponse("index.html", true));
