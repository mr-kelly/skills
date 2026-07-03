import fs from "node:fs/promises";
import path from "node:path";
import { APP_DIR } from "./paths.mjs";
import { demoStatePayload, isDemoQuery } from "./demo.mjs";
import {
  decideReply,
  queueReply,
  readAgentTasks,
  readConfig,
  readExecutionReport,
  readLock,
  readOnboarding,
  readOutbox,
  readSnapshot,
  summarizeConfig
} from "./store.mjs";

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

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 256 * 1024) throw new Error("Request body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

async function state() {
  const [snapshot, outbox, onboarding, lock, agentTasks, executionReport, configResult] = await Promise.all([
    readSnapshot(),
    readOutbox(),
    readOnboarding(),
    readLock(),
    readAgentTasks(),
    readExecutionReport(),
    readConfig()
  ]);
  return {
    app: "kelly-messenger",
    data_provider: process.env.KELLY_MESSENGER_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    snapshot,
    outbox,
    agent_tasks: agentTasks,
    execution_report: executionReport
  };
}

async function handleWrite(req, res, url) {
  const lock = await readLock();
  if (lock) {
    sendJson(res, 423, { error: "Agent lock is active; the outbox is read-only right now.", lock });
    return;
  }
  const body = await readBody(req);
  if (url.pathname === "/api/outbox/queue") {
    const reply = await queueReply({
      conversation_id: String(body.conversation_id || ""),
      text: String(body.text || ""),
      note: String(body.note || ""),
      suggested_by: "human"
    });
    sendJson(res, 200, { ok: true, reply });
    return;
  }
  if (url.pathname === "/api/outbox/decision") {
    const reply = await decideReply({
      reply_id: String(body.reply_id || ""),
      action: String(body.action || ""),
      comment: String(body.comment || ""),
      text: typeof body.text === "string" ? body.text : undefined
    });
    sendJson(res, 200, { ok: true, reply });
    return;
  }
  sendJson(res, 404, { error: "Unknown endpoint" });
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
    if (req.method === "POST" && url.pathname.startsWith("/api/outbox/")) {
      await handleWrite(req, res, url);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, error.message?.startsWith("Unknown") ? 400 : 500, { error: error.message });
  }
}
