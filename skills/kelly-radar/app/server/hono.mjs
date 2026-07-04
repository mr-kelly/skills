import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { APP_DIR } from "./paths.mjs";
import { demoDecisionResponse, demoStatePayload, isDemoQuery } from "./demo.mjs";
import { applyDecisions, saveDecision, saveFollowup } from "./decisions.mjs";
import { readAgentTasks, readConfig, readDecisions, readLock, readOnboarding, readSnapshot, summarizeConfig } from "./store.mjs";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (data-provider
// backed), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider like Busabase — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function state() {
  const [snapshot, onboarding, lock, decisions, agentTasks, configResult] = await Promise.all([
    readSnapshot(),
    readOnboarding(),
    readLock(),
    readDecisions(),
    readAgentTasks(),
    readConfig()
  ]);
  return {
    app: "kelly-radar",
    data_provider: process.env.KELLY_RADAR_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    agent_tasks: agentTasks,
    config_summary: summarizeConfig(configResult),
    snapshot: applyDecisions(snapshot, decisions)
  };
}

async function serveStatic(c) {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`) || filePath.includes(`${path.sep}.cache${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data, 200, {
    "content-type": types[path.extname(filePath)] || "application/octet-stream"
  });
}

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await state(), 200, { "cache-control": "no-store" });
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query) || body.demo) {
    return c.json(demoDecisionResponse(body), 200, { "cache-control": "no-store" });
  }
  const result = await saveDecision(body);
  return c.json(result, result.ok ? 200 : result.status || 400, { "cache-control": "no-store" });
});

app.post("/api/task", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query) || body.demo) {
    return c.json({ ok: true, demo: true, task: { kind: "research_followup", ref_id: body.question_id || "", note: body.question || "", status: "queued" } }, 200, { "cache-control": "no-store" });
  }
  const result = await saveFollowup(body);
  return c.json(result, result.ok ? 200 : result.status || 400, { "cache-control": "no-store" });
});

// ---- Static (vanilla frontend) ----
app.all("*", async (c) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return c.json({ error: "Method not allowed" }, 405, { "cache-control": "no-store" });
  }
  return serveStatic(c);
});

app.onError((err, c) => c.json({ error: err.message }, 500, { "cache-control": "no-store" }));
