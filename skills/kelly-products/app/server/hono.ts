import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR, ASSETS_DIR } from "./paths.ts";
import { applyDecision, getState, readLock } from "./store.ts";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export const app = new Hono();
app.use("/api/state", attachDemoVisuals);

app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await getState(), 200, {
    "cache-control": "no-store",
  });
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  if (isDemoQuery(query)) {
    const raw = await c.req.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400, { "cache-control": "no-store" });
    }
    return c.json(
      {
        ok: true,
        demo: true,
        decisions: {
          updated_at: new Date().toISOString(),
          decisions: {
            [String(payload.item_id || "demo")]: {
              action: payload.action,
              comment: payload.comment || "",
              decided_at: new Date().toISOString(),
            },
          },
        },
      },
      200,
      { "cache-control": "no-store" },
    );
  }

  const lock = await readLock();
  if (lock) {
    return c.json({ error: "Agent lock is active; the product desk is read-only right now.", lock }, 423, {
      "cache-control": "no-store",
    });
  }

  const raw = await c.req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400, { "cache-control": "no-store" });
  }
  try {
    const decisions = await applyDecision(payload);
    return c.json({ ok: true, decisions }, 200, { "cache-control": "no-store" });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400, { "cache-control": "no-store" });
  }
});

app.get("/assets/*", async (c) => {
  const url = new URL(c.req.url);
  const relative = decodeURIComponent(url.pathname.replace(/^\/assets\/?/, ""));
  const filePath = path.normalize(path.join(ASSETS_DIR, relative));
  if (!filePath.startsWith(ASSETS_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
  try {
    const data = await fs.readFile(filePath);
    return c.body(data as unknown as ArrayBuffer, 200, {
      "content-type": types[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "public, max-age=300",
    });
  } catch {
    return c.text("Not found", 404);
  }
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
