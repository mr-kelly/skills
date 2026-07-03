import fs from "node:fs/promises";
import path from "node:path";
import { APP_DIR } from "./paths.mjs";
import { demoStatePayload, isDemoQuery } from "./demo.mjs";
import {
  decideApproval,
  queueReply,
  readAgentTasks,
  readConfig,
  readDecisions,
  readExecutionReport,
  readLock,
  readOnboarding,
  readSnapshot,
  setFollowUp,
  summarizeConfig,
  updateQuote
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
  const [snapshot, decisions, onboarding, lock, agentTasks, executionReport, configResult] = await Promise.all([
    readSnapshot(),
    readDecisions(),
    readOnboarding(),
    readLock(),
    readAgentTasks(),
    readExecutionReport(),
    readConfig()
  ]);
  return {
    app: "kelly-inquiry",
    data_provider: process.env.KELLY_INQUIRY_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    snapshot,
    decisions,
    agent_tasks: agentTasks,
    execution_report: executionReport
  };
}

async function handleWrite(req, res, url) {
  const lock = await readLock();
  if (lock) {
    sendJson(res, 423, { error: "Agent lock is active; the desk is read-only right now.", lock });
    return;
  }
  const body = await readBody(req);
  if (url.pathname === "/api/approvals/queue") {
    const item = await queueReply({
      inquiry_id: String(body.inquiry_id || ""),
      text: String(body.text || ""),
      note: String(body.note || ""),
      suggested_by: "human"
    });
    sendJson(res, 200, { ok: true, item });
    return;
  }
  if (url.pathname === "/api/approvals/decision") {
    const item = await decideApproval({
      item_id: String(body.item_id || ""),
      action: String(body.action || ""),
      comment: String(body.comment || ""),
      text: typeof body.text === "string" ? body.text : undefined
    });
    sendJson(res, 200, { ok: true, item });
    return;
  }
  if (url.pathname === "/api/inquiries/followup") {
    const inquiry = await setFollowUp({
      inquiry_id: String(body.inquiry_id || ""),
      next_follow_up: String(body.next_follow_up || "")
    });
    sendJson(res, 200, { ok: true, inquiry });
    return;
  }
  if (url.pathname === "/api/quotes/update") {
    const quote = await updateQuote({
      quote_id: String(body.quote_id || ""),
      items: Array.isArray(body.items) ? body.items : undefined,
      valid_until: typeof body.valid_until === "string" ? body.valid_until : undefined,
      terms: typeof body.terms === "string" ? body.terms : undefined,
      pricing_notes: typeof body.pricing_notes === "string" ? body.pricing_notes : undefined
    });
    sendJson(res, 200, { ok: true, quote });
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
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      await handleWrite(req, res, url);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, error.message?.startsWith("Unknown") ? 400 : 500, { error: error.message });
  }
}
