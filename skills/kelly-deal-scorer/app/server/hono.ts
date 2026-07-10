import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { getProvider } from "../../lib/data-provider/index.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through lib/data-provider (never node:fs
// directly), so the same app.fetch runs under @hono/node-server locally and,
// once the data layer is cloud-backed, on Cloudflare Workers unchanged.
//
// The frontend is a zero-build vanilla app (index.html + app.js + styles.css +
// i18n). Hono only serves those static files and the JSON API.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await getProvider().getState();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

app.post("/api/decisions", async (c) => {
  const review = await c.req.json().catch(() => null);
  if (!review || typeof review.id !== "string" || typeof review.action !== "string") {
    return c.json({ error: "Body must include { id, action, comment? }" }, 400);
  }
  try {
    const result = await getProvider().submitReview({
      id: review.id,
      action: review.action,
      comment: typeof review.comment === "string" ? review.comment : "",
    });
    return c.json(result);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 409);
  }
});

app.get("/api/agent-tasks", async (c) => {
  return c.json(await getProvider().getAgentTasks());
});

app.post("/api/onboarding/complete", async (c) => {
  const marker = await c.req.json().catch(() => ({}));
  return c.json(await getProvider().completeOnboarding(marker));
});

// ---- Static (vanilla frontend) ----
// Normalize under APP_DIR, block .data/, "/" -> index.html, content-type by
// extension, 403 on escape, 404 on missing file.
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

app.onError((err, c) => c.json({ error: err.message }, 500));
