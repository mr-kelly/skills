import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { summarizeFleet } from "../../lib/generate.ts";
import type { Handoff, HandoffStatus, HandoffTargetType } from "../../lib/types.ts";
import { demoStatePayload, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import { installSetup } from "./setup.ts";
import { appendHandoff, assertUnlocked, readFleet, readHandoffs, readLock } from "./store.ts";

// Platform-neutral Hono app. It speaks the Web-standard fetch(Request)->Response
// contract, so the same app runs under @hono/node-server locally today and could
// run unchanged on an edge runtime once the data layer is backed by a cloud
// store. The frontend is the original zero-build vanilla app (index.html +
// app.js + styles.css + i18n); Hono only serves those static files and the
// JSON API — it does not render or bundle anything.
//
// This app visualizes a MOCK fleet of LLM agents behind a shared AI gateway for
// a generic organization. All data is local, offline, and file-backed; there
// are no external network calls anywhere in this server.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function fullState(): Promise<Record<string, unknown>> {
  const [fleet, handoffs, lock] = await Promise.all([readFleet(), readHandoffs(), readLock()]);
  return {
    app: "kelly-agent-observability",
    data_provider: "local",
    fleet,
    summary: summarizeFleet(fleet),
    handoffs,
    lock,
  };
}

export const app = new Hono();
installSetup(app);

// ---- Bootstrap state (used by the frontend for a single fetch) ----
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const body = isDemoQuery(query) ? demoStatePayload(query) : await fullState();
  return c.body(JSON.stringify(body), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
});

// ---- Discrete REST API ----

// GET fleet summary: total calls, total cost, degraded/critical/healthy counts.
app.get("/api/fleet/summary", async (c) => {
  const fleet = await readFleet();
  return c.json(summarizeFleet(fleet));
});

// GET agents list/health: one row per agent with metrics + status badge.
app.get("/api/agents", async (c) => {
  const fleet = await readFleet();
  const rows = fleet.agents.map((agent) => ({
    ...agent,
    metrics: fleet.metrics.find((m) => m.agent_id === agent.agent_id) || null,
  }));
  return c.json({ agents: rows });
});

// GET agent detail: metrics, hourly series, and recent traces for one agent.
app.get("/api/agents/:agentId", async (c) => {
  const agentId = c.req.param("agentId");
  const fleet = await readFleet();
  const agent = fleet.agents.find((a) => a.agent_id === agentId);
  if (!agent) return c.json({ error: "agent not found" }, 404);
  const metrics = fleet.metrics.find((m) => m.agent_id === agentId) || null;
  const traces = fleet.traces
    .filter((t) => t.agent_id === agentId)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
    .slice(0, 50)
    .map((t) => ({
      trace_id: t.trace_id,
      started_at: t.started_at,
      duration_ms: t.duration_ms,
      status: t.status,
      cost_usd: t.cost_usd,
      step_count: t.steps.length,
      broke_at_step_id: t.broke_at_step_id,
    }));
  return c.json({ agent, metrics, traces });
});

// GET trace detail: ordered step timeline for one trace.
app.get("/api/traces/:traceId", async (c) => {
  const traceId = c.req.param("traceId");
  const fleet = await readFleet();
  const trace = fleet.traces.find((t) => t.trace_id === traceId);
  if (!trace) return c.json({ error: "trace not found" }, 404);
  return c.json({ trace });
});

// POST handoff/acknowledge: writes a human-in-the-loop note to a local jsonl
// file. No external network calls; this is the only mutating endpoint.
app.post("/api/handoffs", async (c) => {
  await assertUnlocked();
  let payload: Record<string, unknown>;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const targetType = String(payload.target_type || "") as HandoffTargetType;
  const targetId = String(payload.target_id || "");
  const agentId = String(payload.agent_id || "");
  const status = String(payload.status || "") as HandoffStatus;
  const note = String(payload.note || "").slice(0, 2000);
  if (!["agent", "trace"].includes(targetType)) return c.json({ error: "target_type must be agent or trace" }, 400);
  if (!targetId) return c.json({ error: "target_id is required" }, 400);
  if (!["acknowledged", "needs_investigation"].includes(status)) {
    return c.json({ error: "status must be acknowledged or needs_investigation" }, 400);
  }
  const handoff: Handoff = {
    handoff_id: randomUUID(),
    target_type: targetType,
    target_id: targetId,
    agent_id: agentId,
    status,
    note,
    created_at: new Date().toISOString(),
    created_by: String(payload.created_by || "operator"),
  };
  await appendHandoff(handoff);
  return c.json({ ok: true, handoff }, 201);
});

app.get("/api/handoffs", async (c) => {
  const handoffs = await readHandoffs();
  return c.json({ handoffs });
});

// ---- Static (vanilla frontend) ----
// Normalize under APP_DIR, block .data/, "/" -> index.html, content-type by
// extension, 403 on escape, 404 on missing file.
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

app.onError((err, c) => c.json({ error: err.message }, ("statusCode" in err ? Number(err.statusCode) : 500) as 500));
