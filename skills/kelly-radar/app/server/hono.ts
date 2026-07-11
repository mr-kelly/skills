import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { createProvider } from "../../lib/data-provider/index.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoDecisionResponse, demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import { installSetup } from "./setup.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through the data-provider (lib/data-provider),
// so the same app runs under @hono/node-server locally and — with the data layer
// on a cloud provider like Busabase — on Cloudflare Workers.
//
// The frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API; it
// does not render or bundle anything.

const provider = await createProvider();
console.log(`Kelly Radar data provider: ${provider.name}`);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function serveStatic(c: Context) {
  const url = new URL(c.req.url);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(APP_DIR, pathname));
  if (
    !filePath.startsWith(APP_DIR) ||
    filePath.includes(`${path.sep}.data${path.sep}`) ||
    filePath.includes(`${path.sep}.cache${path.sep}`)
  ) {
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
}

export const app = new Hono();
installSetup(app);
app.use("/api/state", attachDemoVisuals);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  return c.json(isDemoQuery(query) ? demoStatePayload(query) : await provider.getState(), 200, {
    "cache-control": "no-store",
  });
});

app.post("/api/decision", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query) || body.demo) {
    return c.json(demoDecisionResponse(body), 200, { "cache-control": "no-store" });
  }
  const result = await provider.saveDecision(body);
  return c.json(result, (result.ok ? 200 : result.status || 400) as any, { "cache-control": "no-store" });
});

app.post("/api/task", async (c) => {
  const query = c.req.query();
  const body = await c.req.json().catch(() => ({}));
  if (isDemoQuery(query) || body.demo) {
    return c.json(
      {
        ok: true,
        demo: true,
        task: {
          kind: "research_followup",
          ref_id: body.question_id || "",
          note: body.question || "",
          status: "queued",
        },
      },
      200,
      { "cache-control": "no-store" },
    );
  }
  const result = await provider.saveFollowup(body);
  return c.json(result, (result.ok ? 200 : result.status || 400) as any, { "cache-control": "no-store" });
});

// ---- Static (vanilla frontend) ----
app.all("*", async (c) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return c.json({ error: "Method not allowed" }, 405, { "cache-control": "no-store" });
  }
  return serveStatic(c);
});

app.onError((err, c) => c.json({ error: err.message }, 500, { "cache-control": "no-store" }));
