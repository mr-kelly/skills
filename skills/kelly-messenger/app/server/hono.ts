import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { APP_DIR } from "../../lib/paths.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider, so the same app
// runs under @hono/node-server locally and — once the data layer moves to a
// cloud provider like Busabase — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly Messenger data provider: ${provider.kind}`);

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

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return jsonResponse(c, 200, isDemoQuery(query) ? demoStatePayload(query) : await provider.getState());
});

app.post("/api/outbox/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const lock = await provider.readLock();
  if (lock) {
    return jsonResponse(c, 423, { error: "Agent lock is active; the outbox is read-only right now.", lock });
  }
  const body = await c.req.json().catch(() => ({}));
  if (pathname === "/api/outbox/queue") {
    const reply = await provider.queueReply({
      conversation_id: String(body.conversation_id || ""),
      text: String(body.text || ""),
      note: String(body.note || ""),
      suggested_by: "human",
    });
    return jsonResponse(c, 200, { ok: true, reply });
  }
  if (pathname === "/api/outbox/decision") {
    const reply = await provider.decideReply({
      reply_id: String(body.reply_id || ""),
      action: String(body.action || ""),
      comment: String(body.comment || ""),
      text: typeof body.text === "string" ? body.text : undefined,
    });
    return jsonResponse(c, 200, { ok: true, reply });
  }
  return jsonResponse(c, 404, { error: "Unknown endpoint" });
});

// ---- Static (vanilla frontend) ----
app.all("*", async (c) => {
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
});

app.onError((err, c) => {
  const status = err.message?.startsWith("Unknown") ? 400 : 500;
  return jsonResponse(c, status, { error: err.message });
});
