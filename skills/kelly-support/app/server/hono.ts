import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { APP_DIR } from "../../lib/paths.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider, so the same app
// runs under @hono/node-server locally and — once the data layer moves to a
// cloud provider (KELLY_SUPPORT_DATA_PROVIDER=busabase) — on other fetch-based
// runtimes.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly Support data provider: ${provider.kind}`);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function jsonResponse(c, status, body) {
  return c.body(JSON.stringify(body), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
}

async function state() {
  return { app: "kelly-support", ...(await provider.getState()) };
}

async function handleWrite(c, pathname) {
  const lock = await provider.readLock();
  if (lock) {
    return jsonResponse(c, 423, { error: "Agent lock is active; the desk is read-only right now.", lock });
  }
  const body = await c.req.json().catch(() => ({}));
  try {
    if (pathname === "/api/tickets/queue") {
      const ticket = await provider.queueReply({
        ticket_id: String(body.ticket_id || ""),
        text: String(body.text || ""),
        note: String(body.note || ""),
        kb_refs: Array.isArray(body.kb_refs) ? body.kb_refs.map(String) : undefined,
        suggested_by: "human",
      });
      return jsonResponse(c, 200, { ok: true, ticket });
    }
    if (pathname === "/api/tickets/decision") {
      const ticket = await provider.decideApproval({
        ticket_id: String(body.ticket_id || ""),
        action: String(body.action || ""),
        comment: String(body.comment || ""),
        text: typeof body.text === "string" ? body.text : undefined,
      });
      return jsonResponse(c, 200, { ok: true, ticket });
    }
    if (pathname === "/api/tickets/sla") {
      const ticket = await provider.setSla({
        ticket_id: String(body.ticket_id || ""),
        due_by: String(body.due_by || ""),
      });
      return jsonResponse(c, 200, { ok: true, ticket });
    }
    if (pathname === "/api/tickets/update") {
      const ticket = await provider.updateTicket({
        ticket_id: String(body.ticket_id || ""),
        priority: typeof body.priority === "string" ? body.priority : undefined,
        proposed_action: typeof body.proposed_action === "string" ? body.proposed_action : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
      });
      return jsonResponse(c, 200, { ok: true, ticket });
    }
  } catch (error) {
    const status = error?.statusCode || (error?.message?.startsWith("Unknown") ? 400 : 500);
    return jsonResponse(c, status, { error: error.message });
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
  const status = (err as { statusCode?: number }).statusCode || (err.message?.startsWith("Unknown") ? 400 : 500);
  return jsonResponse(c, status, { error: err.message });
});
