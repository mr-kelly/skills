import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { APP_DIR } from "./paths.mjs";
import { demoStatePayload, isDemoQuery } from "./demo.mjs";
import {
  applyDecision,
  mergeOpportunities,
  readAgentTasks,
  readConfig,
  readDecisions,
  readExecutionReport,
  readLock,
  readOnboarding,
  readSnapshot,
  summarizeConfig
} from "./store.mjs";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (store.mjs), so the
// same app runs under @hono/node-server locally and — once the data layer moves to
// a cloud provider — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function jsonResponse(c, status, body) {
  return c.body(JSON.stringify(body), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

async function state() {
  const [snapshot, onboarding, lock, configResult, decisions, agentTasks, executionReport] = await Promise.all([
    readSnapshot(),
    readOnboarding(),
    readLock(),
    readConfig(),
    readDecisions(),
    readAgentTasks(),
    readExecutionReport()
  ]);
  return {
    app: "kelly-seo",
    data_provider: process.env.KELLY_SEO_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    agent_tasks: agentTasks,
    execution_report: executionReport,
    snapshot: mergeOpportunities(snapshot, decisions, executionReport)
  };
}

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return jsonResponse(c, 200, isDemoQuery(query) ? demoStatePayload(query) : await state());
});

app.post("/api/decision", async (c) => {
  const lock = await readLock();
  if (lock) {
    return jsonResponse(c, 409, { error: "Agent lock present; decisions are read-only right now.", lock });
  }
  const raw = await c.req.text();
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return jsonResponse(c, 400, { error: "Invalid JSON body" });
  }
  const result = await applyDecision({
    id: String(payload.id || ""),
    action: String(payload.action || ""),
    note: payload.note,
    draft: payload.draft
  });
  if (!result.ok) {
    return jsonResponse(c, result.status || 400, { error: result.error });
  }
  return jsonResponse(c, 200, await state());
});

// ---- Static (vanilla frontend) ----
async function serveStatic(c) {
  const pathname = decodeURIComponent(c.req.path === "/" ? "/index.html" : c.req.path);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
  try {
    const data = await fs.readFile(filePath);
    return c.body(data, 200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
  } catch {
    return c.text("Not found", 404);
  }
}

app.all("*", (c) => serveStatic(c));

app.onError((err, c) => jsonResponse(c, 500, { error: err.message }));
