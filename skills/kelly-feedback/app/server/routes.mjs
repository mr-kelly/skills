import fs from "node:fs/promises";
import path from "node:path";
import { APP_DIR } from "./paths.mjs";
import { demoStatePayload, isDemoQuery } from "./demo.mjs";
import { readConfig, readDecisions, readLock, readOnboarding, readSnapshot, recordDecision, summarizeConfig } from "./store.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function state() {
  const [snapshot, onboarding, lock, decisions, configResult] = await Promise.all([
    readSnapshot(),
    readOnboarding(),
    readLock(),
    readDecisions(),
    readConfig()
  ]);
  return {
    app: "kelly-feedback",
    data_provider: process.env.KELLY_FEEDBACK_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    decisions,
    config_summary: summarizeConfig(configResult),
    snapshot
  };
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 512 * 1024) throw new Error("body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

async function handleDecision(req, res) {
  const lock = await readLock();
  if (lock) {
    sendJson(res, 423, { error: "agent lock is active; try again after the agent finishes", lock });
    return;
  }
  try {
    const body = await readBody(req);
    const decisions = await recordDecision(body);
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
    if (url.pathname === "/api/decisions" && req.method === "POST") {
      await handleDecision(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}
