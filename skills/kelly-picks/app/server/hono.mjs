import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { applyDecisions, saveDecision } from "./decisions.mjs";
import { demoDecisionResponse, demoStatePayload, isDemoQuery } from "./demo.mjs";
import { APP_DIR } from "./paths.mjs";
import {
  readAgentTasks,
  readConfig,
  readDecisions,
  readExecutionReport,
  readLock,
  readOnboarding,
  readSnapshot,
  summarizeConfig,
} from "./store.mjs";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (data-provider
// backed), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function state() {
  const [snapshot, onboarding, lock, decisions, agentTasks, executionReport, configResult] = await Promise.all([
    readSnapshot(),
    readOnboarding(),
    readLock(),
    readDecisions(),
    readAgentTasks(),
    readExecutionReport(),
    readConfig(),
  ]);
  return {
    app: "kelly-picks",
    data_provider: process.env.KELLY_PICKS_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    agent_tasks: agentTasks,
    execution_report: executionReport,
    config_summary: summarizeConfig(configResult),
    snapshot: applyDecisions(snapshot, decisions),
  };
}

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await state());
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query) || body.demo) {
    return c.json(demoDecisionResponse(body));
  }
  const result = await saveDecision(body);
  return c.json(result, /** @type {any} */ (result.ok ? 200 : result.status || 400));
});

// ---- Static (vanilla frontend) ----
app.all("*", async (c) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD") {
    return c.json({ error: "Method not allowed" }, 405);
  }
  const pathname = decodeURIComponent(c.req.path === "/" ? "/index.html" : c.req.path);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (
    !filePath.startsWith(APP_DIR) ||
    filePath.includes(`${path.sep}.data${path.sep}`) ||
    filePath.includes(`${path.sep}.cache${path.sep}`)
  ) {
    return c.text("Forbidden", 403);
  }
  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data, 200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
});

app.onError((err, c) => c.json({ error: err.message }, 500));
