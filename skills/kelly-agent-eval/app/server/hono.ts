import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { getProvider } from "../../lib/data-provider/index.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through lib/data-provider/ (never node:fs
// directly), so the same app runs under @hono/node-server locally and — once
// the data layer moves to a cloud provider — on Cloudflare Workers.
//
// The frontend is zero-build vanilla (index.html + app.js + styles.css +
// i18n). Hono only serves those static files and the JSON API.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export const app = new Hono();

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await getProvider().getState();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

interface ReviewBody {
  id?: string;
  action?: string;
  note?: string;
}

interface ReleaseBody {
  decision?: string;
  note?: string;
}

app.post("/api/review", async (c) => {
  const body = await c.req.json<ReviewBody>().catch(() => ({}) as ReviewBody);
  if (!body.id || (body.action !== "mark_blocking" && body.action !== "mark_acceptable")) {
    return c.json({ error: "id and a valid action (mark_blocking|mark_acceptable) are required" }, 400);
  }
  const lock = await getProvider().getLock();
  if (lock && (lock as { owner?: string }).owner)
    return c.json({ error: "Locked while the board is generating a run" }, 409);
  const state = await getProvider().submitReview({ id: body.id, action: body.action, note: body.note || "" });
  return c.json(state);
});

app.post("/api/release-decision", async (c) => {
  const body = await c.req.json<ReleaseBody>().catch(() => ({}) as ReleaseBody);
  if (body.decision !== "approve" && body.decision !== "block") {
    return c.json({ error: "decision must be approve or block" }, 400);
  }
  const lock = await getProvider().getLock();
  if (lock && (lock as { owner?: string }).owner)
    return c.json({ error: "Locked while the board is generating a run" }, 409);
  const state = await getProvider().submitReleaseDecision({ decision: body.decision, note: body.note || "" });
  return c.json(state);
});

app.post("/api/onboarding/complete", async (c) => {
  const marker = await getProvider().completeOnboarding();
  return c.json(marker);
});

// ---- Static (vanilla frontend) ----
app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.text("Forbidden", 403);
  }
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data as unknown as ArrayBuffer, 200, {
    "content-type": types[path.extname(filePath)] || "application/octet-stream",
  });
});

app.onError((err, c) => c.json({ error: err.message }, 500));
