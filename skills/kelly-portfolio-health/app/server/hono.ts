import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { getProvider } from "../../lib/data-provider/index.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import { installSetup } from "./setup.ts";
import { loadState } from "./store.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract and reaches storage only through lib/data-provider/, so the same
// app.fetch runs under @hono/node-server locally and — once the data layer is
// cloud-backed — on Cloudflare Workers unchanged.
//
// The frontend is zero-build vanilla (index.html + app.js + styles.css + i18n).
// Hono only serves those static files and the JSON API.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export const app = new Hono();
installSetup(app);

// ---- API ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await loadState();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

// Human "flag for review" / "clear flag" / note action. This is the only
// write path in the app — everything else is read-only. Writes go through
// the data provider (local files by default), never node:fs directly.
app.post("/api/contracts/:id/decision", async (c) => {
  const id = c.req.param("id");
  const provider = getProvider();
  const lock = await provider.readLock();
  if (lock) return c.json({ error: "Portfolio is locked while the skill is syncing." }, 409);

  let payload: { flagged?: boolean; note?: string };
  try {
    payload = (await c.req.json()) as { flagged?: boolean; note?: string };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const decision = await provider.setDecision(id, {
    flagged: typeof payload.flagged === "boolean" ? payload.flagged : undefined,
    note: typeof payload.note === "string" ? payload.note : undefined,
  });
  return c.json({ id, decision });
});

// ---- Static (vanilla frontend) ----
// Mirrors a plain node:http serveStatic: normalize under APP_DIR, block
// .data/ and .cache/, "/" -> index.html, content-type by extension.
app.get("/*", async (c) => {
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
});

app.onError((err, c) => c.json({ error: err.message }, 500));
