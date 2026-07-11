import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { APP_DIR } from "../../lib/paths.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { installSetup } from "./setup.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider, so the same app
// runs under @hono/node-server locally and — once the data layer moves to a
// cloud provider (KELLY_INQUIRY_DATA_PROVIDER=busabase) — on other fetch-based
// runtimes.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly Inquiry data provider: ${provider.kind}`);

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
  return { app: "kelly-inquiry", ...(await provider.getState()) };
}

async function handleWrite(c, pathname) {
  const lock = await provider.readLock();
  if (lock) {
    return jsonResponse(c, 423, { error: "Agent lock is active; the desk is read-only right now.", lock });
  }
  const body = await c.req.json().catch(() => ({}));
  if (pathname === "/api/approvals/queue") {
    const item = await provider.queueReply({
      inquiry_id: String(body.inquiry_id || ""),
      text: String(body.text || ""),
      note: String(body.note || ""),
      suggested_by: "human",
    });
    return jsonResponse(c, 200, { ok: true, item });
  }
  if (pathname === "/api/approvals/decision") {
    const item = await provider.decideApproval({
      item_id: String(body.item_id || ""),
      action: String(body.action || ""),
      comment: String(body.comment || ""),
      text: typeof body.text === "string" ? body.text : undefined,
    });
    return jsonResponse(c, 200, { ok: true, item });
  }
  if (pathname === "/api/inquiries/followup") {
    const inquiry = await provider.setFollowUp({
      inquiry_id: String(body.inquiry_id || ""),
      next_follow_up: String(body.next_follow_up || ""),
    });
    return jsonResponse(c, 200, { ok: true, inquiry });
  }
  if (pathname === "/api/quotes/update") {
    const quote = await provider.updateQuote({
      quote_id: String(body.quote_id || ""),
      items: Array.isArray(body.items) ? body.items : undefined,
      valid_until: typeof body.valid_until === "string" ? body.valid_until : undefined,
      terms: typeof body.terms === "string" ? body.terms : undefined,
      pricing_notes: typeof body.pricing_notes === "string" ? body.pricing_notes : undefined,
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
installSetup(app);
app.use("/api/state", attachDemoVisuals);

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
