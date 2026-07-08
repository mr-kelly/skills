import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";

const provider = await createProvider();
console.log(`Kelly Finance data provider: ${provider.name}`);

const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

async function state() {
  return {
    app: "kelly-finance",
    data_provider: provider.name,
    onboarding: await provider.readOnboarding(),
    lock: await provider.readLock(),
    config_summary: await provider.getConfigSummary(),
    snapshot: await provider.readSnapshot(),
    execution_report: await provider.readExecutionReport(),
  };
}

export const app = new Hono();
app.use("/api/state", attachDemoVisuals);

app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await state();
  return c.json(body, 200, { "cache-control": "no-store" });
});

app.post("/api/decision", async (c) => {
  try {
    const body = await c.req.json();
    const snapshot = await provider.applyDecision(body);
    return c.json({ ok: true, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ ok: false, error: message }, message.includes("locked") ? 423 : 400);
  }
});

app.post("/api/onboarding/complete", async (c) => {
  const marker = await provider.completeOnboarding();
  return c.json({ ok: true, onboarding: marker });
});

app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`))
    return c.text("Forbidden", 403);
  try {
    const data = await fs.readFile(filePath);
    return c.body(data as unknown as ArrayBuffer, 200, {
      "content-type": types[path.extname(filePath)] || "application/octet-stream",
    });
  } catch {
    return c.text("Not found", 404);
  }
});

app.onError((err, c) => c.json({ error: err.message }, 500));
