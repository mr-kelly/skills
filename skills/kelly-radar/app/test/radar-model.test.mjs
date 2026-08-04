import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConfigSummary,
  buildSnapshot,
  computeMetrics,
  normalizeSignal,
  operationForBrief,
  operationForOpportunity,
  operationForSignal,
  statusForAction,
} from "../app/js/radar-model.js";

test("statusForAction maps every triage verb to its workflow status", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("watch"), "needs_review");
  assert.equal(statusForAction("ignore"), "done");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("unknown"), "needs_review");
});

test("normalizeSignal parses JSON-encoded evidence/handoff/diff and builds triage from decision fields", () => {
  const signal = normalizeSignal({
    signal_id: "sig-1",
    target_id: "formora",
    source_id: "formora-pricing",
    source_kind: "pricing",
    severity: "high",
    detected_at: "2026-07-01T18:04:00.000Z",
    status: "approved",
    headline: "Formora raised Pro from $12 to $15/month",
    summary: "Pro tier price increased.",
    evidence: JSON.stringify([{ title: "Formora pricing page", url: "https://formora.example.com/pricing" }]),
    proposed_action: "act",
    handoff: JSON.stringify({ operation: "handoff_content_brief", target: "kelly-writer", summary: "Comparison page" }),
    diff: JSON.stringify({ lines: [{ type: "added", text: "Pro — $15/mo" }] }),
    decision_verdict: "approve",
    decision_comment: "Yes, brief kelly-writer.",
    decided_at: "2026-06-29T10:02:00.000Z",
  });
  assert.equal(signal.evidence.length, 1);
  assert.equal(signal.handoff.operation, "handoff_content_brief");
  assert.equal(signal.diff.lines.length, 1);
  assert.deepEqual(signal.triage, {
    kind: "signal",
    action: "approve",
    status: "approved",
    comment: "Yes, brief kelly-writer.",
    decided_at: "2026-06-29T10:02:00.000Z",
  });
});

test("buildSnapshot computes watchlist signals_7d at read time from the linked signals", () => {
  const now = Date.parse("2026-07-02T08:30:00.000Z");
  const snapshot = buildSnapshot({
    watchlist: [{ target_id: "formora", name: "Formora", type: "competitor", status: "ok" }],
    signals: [
      {
        signal_id: "sig-recent",
        target_id: "formora",
        detected_at: "2026-07-01T18:04:00.000Z",
        status: "needs_review",
      },
      { signal_id: "sig-old", target_id: "formora", detected_at: "2026-06-01T00:00:00.000Z", status: "done" },
      {
        signal_id: "sig-other-target",
        target_id: "docupad",
        detected_at: "2026-07-01T00:00:00.000Z",
        status: "needs_review",
      },
    ],
    now,
  });
  const formora = snapshot.watchlist.find((item) => item.target_id === "formora");
  assert.equal(formora.signals_7d, 1);
  assert.equal(snapshot.metrics.watch_target_count, 1);
  assert.equal(snapshot.metrics.signal_count, 3);
  assert.equal(snapshot.metrics.signals_needs_review, 2);
});

test("buildSnapshot joins an approved brief's status onto its question (worked example: brief_needs_review -> researching)", () => {
  const snapshot = buildSnapshot({
    questions: [
      {
        question_id: "q-1",
        question: "Should we build a mobile app?",
        status: "brief_needs_review",
        brief_id: "brief-1",
      },
    ],
    briefs: [{ brief_id: "brief-1", question_id: "q-1", status: "approved" }],
  });
  assert.equal(snapshot.research.questions[0].status, "researching");
});

test("buildSnapshot joins a blocked brief's status onto its question (worked example: brief_needs_review -> closed)", () => {
  const snapshot = buildSnapshot({
    questions: [
      { question_id: "q-2", question: "Usage-based vs per-seat?", status: "brief_needs_review", brief_id: "brief-2" },
    ],
    briefs: [{ brief_id: "brief-2", question_id: "q-2", status: "blocked" }],
  });
  assert.equal(snapshot.research.questions[0].status, "closed");
});

test("buildSnapshot leaves a question's status untouched once it has moved past brief_needs_review", () => {
  const snapshot = buildSnapshot({
    questions: [{ question_id: "q-3", question: "SEA market sizing?", status: "report_ready", brief_id: "brief-3" }],
    briefs: [{ brief_id: "brief-3", question_id: "q-3", status: "approved" }],
  });
  assert.equal(snapshot.research.questions[0].status, "report_ready");
});

test("computeMetrics counts open questions, needs-review briefs, and report-ready questions (worked example)", () => {
  const metrics = computeMetrics({
    watchlist: [],
    signals: [],
    research: {
      questions: [
        { status: "brief_needs_review" },
        { status: "researching" },
        { status: "report_ready" },
        { status: "closed" },
      ],
      briefs: [{ status: "needs_review" }, { status: "approved" }],
      reports: [],
    },
    trends: { movers: [], opportunities: [{ status: "needs_review" }, { status: "done" }] },
  });
  assert.equal(metrics.questions_open, 3);
  assert.equal(metrics.briefs_needs_review, 1);
  assert.equal(metrics.reports_ready, 1);
  assert.equal(metrics.opportunities_open, 1);
});

test("buildConfigSummary derives watchlist source counts/methods and research defaults from live rows", () => {
  const summary = buildConfigSummary({
    watchlist: [
      {
        target_id: "formora",
        name: "Formora",
        type: "competitor",
        sources: [{ method: "browser_agent" }, { method: "manual" }, { method: "browser_agent" }],
      },
    ],
    settings: {
      products: JSON.stringify([{ name: "Formlet", positioning: "AI-assisted form builder" }]),
      research_default_depth: "deep",
      research_require_citations: "false",
      research_max_sources: 6,
      trend_sources: JSON.stringify([{ source_id: "search-rising", kind: "search" }]),
      cadence_monitor: "daily",
      cadence_trends: "weekly",
    },
  });
  assert.equal(summary.watchlist[0].source_count, 3);
  assert.deepEqual(summary.watchlist[0].methods.sort(), ["browser_agent", "manual"]);
  assert.equal(summary.research_defaults.default_depth, "deep");
  assert.equal(summary.research_defaults.require_citations, false);
  assert.equal(summary.research_defaults.max_sources, 6);
  assert.equal(summary.profile.products[0].name, "Formlet");
  assert.equal(summary.trend_sources.length, 1);
  assert.deepEqual(summary.cadence, { monitor: "daily", trends: "weekly" });
});

test("operationForSignal falls back to a start_research handoff when the signal has none", () => {
  assert.deepEqual(operationForSignal({ headline: "Untitled change" }), {
    operation: "start_research",
    target: "",
    summary: "Untitled change",
  });
  assert.deepEqual(
    operationForSignal({
      headline: "Pricing change",
      handoff: { operation: "add_watch_source", target: "docupad", summary: "Add DocuPad beta docs page." },
    }),
    { operation: "add_watch_source", target: "docupad", summary: "Add DocuPad beta docs page." },
  );
});

test("operationForBrief always targets start_research for the linked question", () => {
  const op = operationForBrief(
    { brief_id: "brief-1" },
    { question_id: "q-1", question: "Should we build a mobile app?" },
  );
  assert.equal(op.operation, "start_research");
  assert.equal(op.target, "q-1");
  assert.match(op.summary, /Should we build a mobile app\?/);
});

test("operationForOpportunity falls back to handoff_content_brief when proposed_next_step is missing", () => {
  assert.deepEqual(operationForOpportunity({ title: "Own the AI form builder surface" }), {
    operation: "handoff_content_brief",
    target: "",
    summary: "Own the AI form builder surface",
  });
});
