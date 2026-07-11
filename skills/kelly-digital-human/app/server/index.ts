#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ensureDirs, readJson, writeJson } from "../../lib/common.ts";
import { appDir, dataDir, decisionsPath, defaultHost, defaultPort, lockPath, snapshotPath } from "../../lib/paths.ts";
import { attachDemoVisuals } from "./demo-visuals.ts";
import { demoState, isDemoQuery } from "./demo.ts";
import { installSetup } from "./setup.ts";

const host = process.env.KELLY_DIGITAL_HUMAN_UI_HOST || defaultHost;
const port = Number.parseInt(process.env.KELLY_DIGITAL_HUMAN_UI_PORT || process.env.PORT || String(defaultPort), 10);
const app = new Hono();
installSetup(app);
app.use("/api/state", attachDemoVisuals);

function queryFor(requestUrl: string): URLSearchParams {
  return new URL(requestUrl).searchParams;
}

// A lock older than this is treated as abandoned/stale so a crashed agent
// can never permanently block human review.
const LOCK_STALE_MS = 15 * 60 * 1000;

async function isLocked(): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    return Date.now() - stat.mtimeMs <= LOCK_STALE_MS;
  } catch {
    return false;
  }
}

async function localState() {
  const demo = demoState();
  const snapshot = (await readJson(snapshotPath, demo.snapshot)) || demo.snapshot;
  const decisions = (await readJson(decisionsPath, { decisions: {} })) || { decisions: {} };
  const locked = await isLocked();
  return { snapshot, decisions, locked };
}

app.get("/api/state", async (c) => {
  const query = queryFor(c.req.url);
  const state = isDemoQuery(query) ? demoState(query) : await localState();
  return c.json({ app: "kelly-digital-human", ...state });
});

app.post("/api/decision", async (c) => {
  const query = queryFor(c.req.url);
  if (isDemoQuery(query)) return c.json({ ok: true, demo: true });

  if (await isLocked()) {
    return c.json({ ok: false, error: "agent.lock is active; try again after the agent finishes" }, 423);
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const checkId = String(body.check_id || "");
  const action = String(body.action || "");
  if (!checkId || !["approve", "request_changes", "block"].includes(action)) {
    return c.json({ ok: false, error: "check_id and valid action are required" }, 400);
  }

  await ensureDirs(dataDir);
  const current = ((await readJson(decisionsPath, { decisions: {} })) || { decisions: {} }) as {
    decisions: Record<string, unknown>;
  };
  current.decisions[checkId] = {
    action,
    note: String(body.note || ""),
    decided_at: new Date().toISOString(),
  };
  await writeJson(decisionsPath, current);
  return c.json({ ok: true, decisions: current });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

app.get("*", async (c) => {
  const urlPath = new URL(c.req.url).pathname;
  const clean = urlPath === "/" ? "/index.html" : urlPath;
  const file = path.normalize(path.join(appDir, clean));
  if (!file.startsWith(appDir)) return c.text("Forbidden", 403);
  const ext = path.extname(file);
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
  };
  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return c.text("Not found", 404);
  }
  return c.body(data as unknown as ArrayBuffer, 200, {
    "content-type": `${types[ext] || "application/octet-stream"}; charset=utf-8`,
  });
});

app.onError((error, c) => c.json({ error: error.message }, 500));

await ensureDirs(dataDir);
serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Kelly Digital Human UI: http://${host}:${info.port}/`);
});
