import fs from "node:fs/promises";
import path from "node:path";
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

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
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
    app: "kelly-listing",
    data_provider: process.env.KELLY_LISTING_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    decisions,
    agent_tasks: agentTasks,
    execution_report: executionReport,
    snapshot
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleDecision(req, res) {
  const lock = await readLock();
  if (lock) {
    sendJson(res, 423, { error: "Agent lock is active; the review queue is read-only right now.", lock });
    return;
  }
  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || "{}");
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }
  try {
    const decisions = await applyDecision(payload);
    sendJson(res, 200, { ok: true, decisions });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

export async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/api/state") {
      const query = Object.fromEntries(url.searchParams.entries());
      sendJson(res, 200, isDemoQuery(query) ? demoStatePayload(query) : await state());
      return;
    }
    if (url.pathname === "/api/decision" && req.method === "POST") {
      await handleDecision(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
