import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { APP_DIR } from "./paths.ts";
import { installSetup } from "./setup.ts";

const provider = await createProvider();
console.log(`Kelly Invoice Sheet data provider: ${provider.kind}`);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export const app = new Hono();
installSetup(app);
app.use("/api/state", attachDemoVisuals);

app.get("/api/state", async (c) => {
  const state = await provider.getState();
  return c.json(
    {
      app: "kelly-invoice-sheet",
      ...state,
    },
    200,
    { "cache-control": "no-store" },
  );
});

app.post("/api/decision", async (c) => {
  const payload = await c.req.json();
  const decisions = await provider.applyDecision(payload);
  return c.json({ ok: true, decisions });
});

app.post("/api/onboarding/complete", async (c) => {
  const payload = await c.req.json().catch(() => ({}));
  const marker = await provider.completeOnboarding(payload);
  return c.json({ ok: true, onboarding: marker });
});

app.get("/*", async (c) => {
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

app.onError((err, c) => {
  const statusCode = Number((err as Error & { statusCode?: number }).statusCode || 500);
  return c.json({ ok: false, error: err.message }, statusCode as 500);
});
