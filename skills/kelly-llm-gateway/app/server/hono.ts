import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { recordAnomalyAck, recordRolloutDecision } from "./decisions.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import { attachDerived, readConfig, readLock, readOnboarding, readSnapshot, summarizeConfig } from "./store.ts";
import type { RolloutAction } from "./types.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (data-provider
// backed), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything. Human actions here only ever write local
// handoff files under app/.data/ — they never change a real routing config.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const ROLLOUT_ACTIONS: RolloutAction[] = ["promote", "rollback", "hold"];

async function state(): Promise<Record<string, unknown>> {
  const [snapshot, onboarding, lock, configResult] = await Promise.all([
    readSnapshot(),
    readOnboarding(),
    readLock(),
    readConfig(),
  ]);
  await attachDerived(snapshot, configResult);
  return {
    app: "kelly-llm-gateway",
    data_provider: process.env.KELLY_LLM_GATEWAY_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    snapshot,
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

app.post("/api/rollouts/:routeId/decision", async (c) => {
  const lock = await readLock();
  if (lock) return c.json({ error: "Locked: another write is in progress" }, 409);
  const routeId = c.req.param("routeId");
  const body = await c.req.json().catch(() => ({}));
  const action = String(body.action || "");
  if (!ROLLOUT_ACTIONS.includes(action as RolloutAction)) {
    return c.json({ error: `action must be one of ${ROLLOUT_ACTIONS.join("|")}` }, 400);
  }
  const decisions = await recordRolloutDecision(routeId, action as RolloutAction, String(body.note || ""));
  return c.json({ ok: true, decisions });
});

app.post("/api/anomalies/:anomalyId/ack", async (c) => {
  const lock = await readLock();
  if (lock) return c.json({ error: "Locked: another write is in progress" }, 409);
  const anomalyId = c.req.param("anomalyId");
  const body = await c.req.json().catch(() => ({}));
  const decisions = await recordAnomalyAck(anomalyId, String(body.note || ""));
  return c.json({ ok: true, decisions });
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
