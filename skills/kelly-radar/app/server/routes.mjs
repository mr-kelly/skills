import fs from "node:fs/promises";
import path from "node:path";
import { APP_DIR } from "./paths.mjs";
import { demoDecisionResponse, demoStatePayload, isDemoQuery } from "./demo.mjs";
import { applyDecisions, saveDecision, saveFollowup } from "./decisions.mjs";
import { readAgentTasks, readConfig, readDecisions, readLock, readOnboarding, readSnapshot, summarizeConfig } from "./store.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

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

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`) || filePath.includes(`${path.sep}.cache${path.sep}`)) {
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
    const query = Object.fromEntries(url.searchParams.entries());
    const demo = isDemoQuery(query);
    if (url.pathname === "/api/state") {
      sendJson(res, 200, demo ? demoStatePayload(query) : await state());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/decision") {
      const body = await readJsonBody(req);
      if (demo || body.demo) {
        sendJson(res, 200, demoDecisionResponse(body));
        return;
      }
      const result = await saveDecision(body);
      sendJson(res, result.ok ? 200 : result.status || 400, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/task") {
      const body = await readJsonBody(req);
      if (demo || body.demo) {
        sendJson(res, 200, { ok: true, demo: true, task: { kind: "research_followup", ref_id: body.question_id || "", note: body.question || "", status: "queued" } });
        return;
      }
      const result = await saveFollowup(body);
      sendJson(res, result.ok ? 200 : result.status || 400, result);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
