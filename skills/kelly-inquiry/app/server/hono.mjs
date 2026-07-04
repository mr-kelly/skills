import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
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

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the logic modules (data-provider
// backed), so the same app runs under @hono/node-server locally and — once the
// data layer moves to a cloud provider — on other fetch-based runtimes.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function jsonResponse(c, status, body) {
  return c.body(JSON.stringify(body), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
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

async function handleWrite(c, pathname) {
  const lock = await readLock();
  if (lock) {
    return jsonResponse(c, 423, { error: "Agent lock is active; the desk is read-only right now.", lock });
  }
  const body = await c.req.json().catch(() => ({}));
  if (pathname === "/api/approvals/queue") {
    const item = await queueReply({
      inquiry_id: String(body.inquiry_id || ""),
      text: String(body.text || ""),
      note: String(body.note || ""),
      suggested_by: "human"
    });
    return jsonResponse(c, 200, { ok: true, item });
  }
  if (pathname === "/api/approvals/decision") {
    const item = await decideApproval({
      item_id: String(body.item_id || ""),
      action: String(body.action || ""),
      comment: String(body.comment || ""),
      text: typeof body.text === "string" ? body.text : undefined
    });
    return jsonResponse(c, 200, { ok: true, item });
  }
  if (pathname === "/api/inquiries/followup") {
    const inquiry = await setFollowUp({
      inquiry_id: String(body.inquiry_id || ""),
      next_follow_up: String(body.next_follow_up || "")
    });
    return jsonResponse(c, 200, { ok: true, inquiry });
  }
  if (pathname === "/api/quotes/update") {
    const quote = await updateQuote({
      quote_id: String(body.quote_id || ""),
      items: Array.isArray(body.items) ? body.items : undefined,
      valid_until: typeof body.valid_until === "string" ? body.valid_until : undefined,
      terms: typeof body.terms === "string" ? body.terms : undefined,
      pricing_notes: typeof body.pricing_notes === "string" ? body.pricing_notes : undefined
    });
    return jsonResponse(c, 200, { ok: true, quote });
  }
  return jsonResponse(c, 404, { error: "Unknown endpoint" });
}

async function serveStatic(c) {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.body("Forbidden", 403);
  }
  try {
    const data = await fs.readFile(filePath);
    return c.body(data, 200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
  } catch {
    return c.body("Not found", 404);
  }
}

export const app = new Hono();

app.get("/api/state", async (c) => {
  const query = c.req.query();
  return jsonResponse(c, 200, isDemoQuery(query) ? demoStatePayload(query) : await state());
});

app.post("/api/*", async (c) => {
  const url = new URL(c.req.url);
  return handleWrite(c, url.pathname);
});

app.all("*", (c) => serveStatic(c));

app.onError((err, c) => {
  const status = err.message?.startsWith("Unknown") ? 400 : 500;
  return jsonResponse(c, status, { error: err.message });
});
