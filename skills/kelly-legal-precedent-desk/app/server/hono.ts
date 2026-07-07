import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { APP_DIR } from "../../lib/paths.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";

const provider = await createProvider();
console.log(`Legal Precedent Desk data provider: ${provider.kind}`);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

export const app = new Hono();

app.get("/api/state", async (c) => {
  const query = c.req.query();
  const payload = isDemoQuery(query) ? demoStatePayload(query) : await provider.getState();
  return c.json(payload, 200, { "cache-control": "no-store" });
});

app.post("/api/decision", async (c) => {
  const lock = await provider.readLock();
  if (lock) {
    return c.json({ error: "Agent lock is active; the review queue is read-only right now.", lock }, 423, {
      "cache-control": "no-store",
    });
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse((await c.req.text()) || "{}");
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400, { "cache-control": "no-store" });
  }
  try {
    const decisions = await provider.applyDecision(payload);
    return c.json({ ok: true, decisions }, 200, { "cache-control": "no-store" });
  } catch (error) {
    const status = ((error as { statusCode?: number }).statusCode as 400 | 423) || 400;
    return c.json({ error: (error as Error).message }, status, { "cache-control": "no-store" });
  }
});

app.post("/api/onboarding/complete", async (c) => {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse((await c.req.text()) || "{}");
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400, { "cache-control": "no-store" });
  }
  const marker = await provider.completeOnboarding(payload);
  return c.json({ ok: true, onboarding: marker }, 200, { "cache-control": "no-store" });
});

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
