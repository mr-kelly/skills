import fs from "node:fs/promises";
import path from "node:path";
import { type Context, Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import { installSetup } from "./setup.ts";

const provider = await createProvider();
console.log(`Kelly Scale PPTX data provider: ${provider.kind}`);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function jsonResponse(c: Context, status: number, body: unknown) {
  return c.json(body as Record<string, unknown>, status as 200, { "cache-control": "no-store" });
}

export const app = new Hono();
installSetup(app);
app.use("/api/state", attachDemoVisuals);

app.get("/api/state", async (c) => {
  const query = c.req.query();
  return jsonResponse(c, 200, isDemoQuery(query) ? demoStatePayload(query) : await provider.getState());
});

app.post("/api/decision", async (c) => {
  const lock = await provider.readLock();
  if (lock) return jsonResponse(c, 423, { error: "Agent lock is active; the review queue is read-only.", lock });
  let payload: unknown;
  try {
    const raw = await c.req.text();
    if (raw.length > 1_000_000) throw new Error("Body too large");
    payload = JSON.parse(raw || "{}");
  } catch {
    return jsonResponse(c, 400, { error: "Invalid JSON body" });
  }
  try {
    const decisions = await provider.applyDecision(payload as Parameters<typeof provider.applyDecision>[0]);
    return jsonResponse(c, 200, { ok: true, decisions });
  } catch (error) {
    return jsonResponse(c, 400, { error: (error as Error).message });
  }
});

app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`))
    return c.text("Forbidden", 403);
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
