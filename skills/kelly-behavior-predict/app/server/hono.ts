import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { demoRouteFor, isDemoQuery } from "./demo.ts";
import { APP_DIR } from "./paths.ts";
import {
  readDataset,
  readDecision,
  readDecisions,
  readLock,
  readOnboarding,
  summarizeConfig,
  writeDecision,
} from "./store.ts";
import type { DecisionStatus } from "./types.ts";

// Platform-neutral Hono app: speaks the Web-standard fetch(Request)->Response
// contract. Runs locally under @hono/node-server via app/start.sh; the
// frontend is the original zero-build vanilla app (index.html + app.js +
// styles.css + i18n). Hono only serves those static files and the JSON API,
// and it reaches storage only through ./store.ts (data-provider backed).
//
// Boundary: this app reads/writes ONLY local files under app/.data/. It never
// calls a real ML/LLM service and never reaches any external system. The
// "prediction" is a deterministic rule-based heuristic in lib/predict.ts —
// the app just renders it and records a human review note per segment.

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function json(c: import("hono").Context, body: unknown, status = 200) {
  return c.body(JSON.stringify(body), status as 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
}

export const app = new Hono();

// ---- API ----

// Combined bootstrap payload for the frontend shell.
app.get("/api/state", async (c) => {
  const query = c.req.query();
  const [dataset, decisions, onboarding, lock, configSummary] = await Promise.all([
    readDataset(),
    readDecisions(),
    readOnboarding(),
    readLock(),
    summarizeConfig(),
  ]);
  return json(c, {
    app: "kelly-behavior-predict",
    demo: isDemoQuery(query),
    demo_route: isDemoQuery(query) ? demoRouteFor(query) : null,
    seed: dataset.seed,
    generated_at_note: dataset.generated_at_note,
    segment_ids: dataset.segments.map((s) => s.segment_id),
    onboarding,
    lock,
    config_summary: configSummary,
    decisions,
  });
});

// Overview: aggregate funnel drop-off + overall backtest summary.
app.get("/api/overview", async (c) => {
  const dataset = await readDataset();
  return json(c, {
    seed: dataset.seed,
    overall_funnel: dataset.overall_funnel,
    overall_backtest: dataset.overall_backtest,
    segment_count: dataset.segments.length,
    total_sessions: dataset.segments.reduce((sum, s) => sum + s.session_count, 0),
  });
});

// Segment list: per-segment funnel + prediction + backtest summary (no raw sessions, keeps payload small).
app.get("/api/segments", async (c) => {
  const dataset = await readDataset();
  const decisions = await readDecisions();
  const segments = dataset.segments.map((entry) => ({
    segment_id: entry.segment_id,
    session_count: entry.session_count,
    funnel: entry.funnel,
    prediction_summary: entry.prediction_summary,
    backtest: {
      accuracy: entry.backtest.accuracy,
      macro_precision: entry.backtest.macro_precision,
      macro_recall: entry.backtest.macro_recall,
      macro_f1: entry.backtest.macro_f1,
    },
    decision: decisions[entry.segment_id] || null,
  }));
  return json(c, { segments });
});

// Segment detail: full funnel, rule triggers, sample sessions, backtest, decision.
app.get("/api/segments/:id", async (c) => {
  const id = c.req.param("id");
  const dataset = await readDataset();
  const entry = dataset.segments.find((s) => s.segment_id === id);
  if (!entry) return json(c, { error: `Unknown segment: ${id}` }, 404);
  const decision = await readDecision(id);
  return json(c, {
    segment_id: entry.segment_id,
    session_count: entry.session_count,
    funnel: entry.funnel,
    prediction_summary: entry.prediction_summary,
    backtest: entry.backtest,
    sample_sessions: entry.sessions.slice(0, 12),
    decision,
  });
});

// Prediction-accuracy backtest view: per segment + overall.
app.get("/api/backtest", async (c) => {
  const dataset = await readDataset();
  return json(c, {
    overall: dataset.overall_backtest,
    per_segment: dataset.segments.map((entry) => entry.backtest),
  });
});

// Human-in-the-loop review: mark a segment's rule "trusted" or
// "needs_recalibration" with a free-text note. Writes app/.data/decisions.json
// only — a pure review surface, no live system changes.
app.post("/api/segments/:id/decision", async (c) => {
  const id = c.req.param("id");
  const dataset = await readDataset();
  if (!dataset.segments.some((s) => s.segment_id === id)) return json(c, { error: `Unknown segment: ${id}` }, 404);
  let body: { status?: string; note?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return json(c, { error: "Invalid JSON body" }, 400);
  }
  const status = body.status as DecisionStatus;
  if (status !== "trusted" && status !== "needs_recalibration") {
    return json(c, { error: "status must be 'trusted' or 'needs_recalibration'" }, 400);
  }
  const decision = await writeDecision(id, status, body.note || "");
  return json(c, { decision });
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
