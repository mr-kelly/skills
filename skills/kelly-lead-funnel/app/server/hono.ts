import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { withLock } from "../../lib/common.ts";
import { getProvider } from "../../lib/data-provider/index.ts";
import { STAGES, type Stage } from "../../lib/types.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import { buildState } from "./store.ts";

// Platform-neutral Hono app: Web-standard fetch(Request)->Response, reaching
// storage only through lib/data-provider/, so the same app.fetch runs under
// @hono/node-server locally and — once the provider is cloud-backed — on
// Cloudflare Workers unchanged.
//
// The frontend is the zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API.

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
  const body = isDemoQuery(query) ? demoStatePayload(query) : await buildState();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

app.post("/api/leads/:id/stage", async (c) => {
  const provider = getProvider();
  const lock = await provider.getLock();
  if (lock) return c.json({ error: "locked", lock }, 423);
  const id = c.req.param("id");
  const body = await c.req
    .json<{ stage?: string; reason?: string }>()
    .catch(() => ({}) as { stage?: string; reason?: string });
  if (!body.stage || !STAGES.includes(body.stage as Stage)) {
    return c.json({ error: `stage must be one of ${STAGES.join("|")}` }, 400);
  }
  if (body.stage === "rejected" && !body.reason) {
    return c.json({ error: "reason is required to move a lead to rejected" }, 400);
  }
  const lead = await withLock("kelly-lead-funnel", `Moving ${id} to ${body.stage}`, () =>
    provider.moveStage(id, body.stage as Stage, body.reason),
  );
  if (!lead) return c.json({ error: "lead not found" }, 404);
  return c.json({ lead });
});

app.post("/api/leads/:id/notes", async (c) => {
  const provider = getProvider();
  const lock = await provider.getLock();
  if (lock) return c.json({ error: "locked", lock }, 423);
  const id = c.req.param("id");
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string });
  if (!body.text || !body.text.trim()) return c.json({ error: "text is required" }, 400);
  const lead = await withLock("kelly-lead-funnel", `Adding note to ${id}`, () =>
    provider.addNote(id, body.text.trim()),
  );
  if (!lead) return c.json({ error: "lead not found" }, 404);
  return c.json({ lead });
});

// ---- Static (vanilla frontend) ----
// Mirrors the App-in-Skill node:http serveStatic contract: normalize under
// APP_DIR, block .data/, "/" -> index.html, content-type by extension, 403 on
// escape, 404 on missing file.
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
