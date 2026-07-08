import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { APP_DIR } from "../../lib/paths.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider, so the same app
// runs under @hono/node-server locally and — with KELLY_FEEDBACK_DATA_PROVIDER=
// busabase — against a Busabase base on other fetch-based runtimes.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly Feedback data provider: ${provider.kind}`);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function state() {
  const review = await provider.getState();
  return {
    app: "kelly-feedback",
    data_provider: provider.kind,
    ...review,
  };
}

async function sendFile(c, filePath) {
  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return c.body("Not found", 404);
  }
  return c.body(data, 200, {
    "content-type": types[path.extname(filePath)] || "application/octet-stream",
  });
}

export const app = new Hono();
app.use("/api/state", attachDemoVisuals);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await state(), 200, { "cache-control": "no-store" });
});

app.post("/api/decisions", async (c) => {
  const lock = await provider.readLock();
  if (lock) {
    return c.json({ error: "agent lock is active; try again after the agent finishes", lock }, 423, {
      "cache-control": "no-store",
    });
  }
  try {
    const body = await c.req.json().catch(() => ({}));
    const decisions = await provider.saveDecision(body);
    return c.json({ ok: true, decisions }, 200, { "cache-control": "no-store" });
  } catch (error) {
    return c.json({ error: error.message }, 400, { "cache-control": "no-store" });
  }
});

// ---- Static (vanilla frontend) ----
// Catch-all with the same guard as the original node:http server: resolve the
// requested path within APP_DIR, refuse anything escaping it or reaching .data/,
// and map "/" to index.html.
app.get("/*", async (c) => {
  const pathname = decodeURIComponent(c.req.path === "/" ? "/index.html" : c.req.path);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (!filePath.startsWith(APP_DIR) || filePath.includes(`${path.sep}.data${path.sep}`)) {
    return c.body("Forbidden", 403);
  }
  return sendFile(c, filePath);
});

app.onError((err, c) => c.json({ error: err.message }, 500));
