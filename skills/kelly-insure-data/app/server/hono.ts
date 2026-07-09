import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { demoSnapshot } from "../../lib/data-provider/local-file-provider.ts";
import { APP_DIR } from "../../lib/paths.ts";

const provider = await createProvider();
console.log(`Kelly Insure Data provider: ${provider.name}`);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export const app = new Hono();

app.get("/api/state", async (c) => {
  const query = c.req.query();
  if (query.demo) {
    return c.json(
      {
        app: "kelly-insure-data",
        data_provider: "demo",
        config_summary: { provider: "demo" },
        onboarding: { completed: true, source: "demo" },
        lock: null,
        snapshot: demoSnapshot(),
        demo: true,
        demo_scenario: query.demo,
      },
      200,
      { "cache-control": "no-store" },
    );
  }
  return c.json(await provider.getState(), 200, { "cache-control": "no-store" });
});

app.get("*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
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
