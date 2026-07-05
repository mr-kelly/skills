import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import {
  applyDecision,
  mergeAnomalies,
  readAgentTasks,
  readConfig,
  readDecisions,
  readExecutionReport,
  readLock,
  readOnboarding,
  readSnapshot,
  summarizeConfig,
} from "./store.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (data-provider
// backed), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider — on other fetch runtimes.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const MAX_BODY = 1_000_000;

async function state() {
  const [snapshot, onboarding, lock, configResult, decisions, agentTasks, executionReport] = await Promise.all([
    readSnapshot(),
    readOnboarding(),
    readLock(),
    readConfig(),
    readDecisions(),
    readAgentTasks(),
    readExecutionReport(),
  ]);
  return {
    app: "kelly-audit",
    data_provider: process.env.KELLY_AUDIT_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    agent_tasks: agentTasks,
    execution_report: executionReport,
    snapshot: mergeAnomalies(snapshot, decisions, executionReport),
  };
}

function json(c, status, body) {
  return c.body(JSON.stringify(body), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
}

async function readBodyText(c) {
  const raw = await c.req.text();
  if (raw.length > MAX_BODY) throw new Error("Body too large");
  return raw;
}

async function handleDecision(c) {
  const lock = await readLock();
  if (lock) {
    return json(c, 423, { error: "Agent lock present; the anomaly queue is read-only right now.", lock });
  }
  let payload: any;
  try {
    payload = JSON.parse((await readBodyText(c)) || "{}");
  } catch {
    return json(c, 400, { error: "Invalid JSON body" });
  }
  const result = await applyDecision({
    id: String(payload.id || ""),
    action: String(payload.action || ""),
    note: payload.note,
    draft: payload.draft,
  });
  if (!result.ok) {
    return json(c, result.status || 400, { error: result.error });
  }
  return json(c, 200, await state());
}

async function serveStatic(c) {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
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

export const app = new Hono();

app.get("/api/state", async (c) => {
  const query = c.req.query();
  return json(c, 200, isDemoQuery(query) ? demoStatePayload(query) : await state());
});

app.post("/api/decision", (c) => handleDecision(c));

// Static (vanilla frontend). Catch-all covers "/" -> index.html plus every
// asset, with the same in-APP_DIR / block-.data guard as the old server.
app.all("*", (c) => serveStatic(c));

app.onError((err, c) => c.json({ error: err.message }, 500));
