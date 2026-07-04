import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { APP_DIR } from "./paths.mjs";
import { demoStatePayload, isDemoQuery } from "./demo.mjs";
import {
  applyDecision,
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
  ".svg": "image/svg+xml; charset=utf-8"
};

function jsonResponse(c, status, body) {
  return c.json(body, status, { "cache-control": "no-store" });
}

async function state() {
  const [snapshot, decisions, agentTasks, executionReport, onboarding, lock, configResult] = await Promise.all([
    readSnapshot(),
    readDecisions(),
    readAgentTasks(),
    readExecutionReport(),
    readOnboarding(),
    readLock(),
    readConfig()
  ]);
  return {
    app: "kelly-lesson",
    data_provider: process.env.KELLY_LESSON_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    decisions,
    agent_tasks: agentTasks,
    execution_report: executionReport,
    snapshot
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
    return jsonResponse(c, 423, {
      error: "Agent lock is active; the review queue is read-only right now.",
      lock
    });
  }
  let payload;
  try {
    const raw = await c.req.text();
    if (raw.length > 1_000_000) throw new Error("Body too large");
    payload = JSON.parse(raw || "{}");
  } catch {
    return jsonResponse(c, 400, { error: "Invalid JSON body" });
  }
  try {
    const decisions = await applyDecision(payload);
    return jsonResponse(c, 200, { ok: true, decisions });
  } catch (error) {
    return jsonResponse(c, 400, { error: error.message });
  }
});

// ---- Static (vanilla frontend) ----
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
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
});

app.onError((err, c) => c.json({ error: err.message }, 500));
