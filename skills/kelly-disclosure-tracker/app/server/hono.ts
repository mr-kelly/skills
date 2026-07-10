import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import {
  acquireLock,
  applyDecisions,
  readBatch,
  readConfig,
  readDecisions,
  readLock,
  readOnboarding,
  recordDecision,
  releaseLock,
  summarizeConfig,
} from "./store.ts";
import type { Decision, DecisionAction } from "./types.ts";

// Platform-neutral Hono app. Speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through store.ts (data-provider backed), so
// the same app runs under @hono/node-server locally and — once the data layer
// moves to a cloud provider — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const VALID_ACTIONS: DecisionAction[] = ["verified", "needs_source", "flagged"];

async function state(): Promise<Record<string, unknown>> {
  const [rawBatch, decisions, onboarding, lock, configResult] = await Promise.all([
    readBatch(),
    readDecisions(),
    readOnboarding(),
    readLock(),
    readConfig(),
  ]);
  const batch = applyDecisions(rawBatch, decisions);
  return {
    app: "kelly-disclosure-tracker",
    data_provider: process.env.KELLY_DISCLOSURE_TRACKER_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    batch,
  };
}

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await state();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

app.post("/api/items/:id/decision", async (c) => {
  const lock = await readLock();
  if (lock) return c.json({ error: "Locked while the tracker is generating a batch." }, 423);

  const id = c.req.param("id");
  let payload: { action?: string; comment?: string };
  try {
    payload = (await c.req.json()) as { action?: string; comment?: string };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const action = payload.action as DecisionAction;
  if (!VALID_ACTIONS.includes(action)) {
    return c.json({ error: `action must be one of ${VALID_ACTIONS.join("|")}` }, 400);
  }

  const decision: Decision = {
    action,
    comment: typeof payload.comment === "string" ? payload.comment.slice(0, 4000) : undefined,
    decided_at: new Date().toISOString(),
  };

  try {
    await acquireLock("kelly-disclosure-tracker", `Recording decision for ${id}`);
    const batch = await recordDecision(id, decision);
    return c.json({ ok: true, batch });
  } finally {
    await releaseLock();
  }
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
