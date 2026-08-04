import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConfigSummary,
  buildSnapshot,
  normalizeFeedbackItem,
  normalizeProposal,
  normalizeRequestItem,
  recomputeDerived,
  statusForProposalAction,
  triageForFeedbackAction,
} from "../app/js/feedback-model.js";

test("statusForProposalAction maps every decision verdict; revise never changes status", () => {
  assert.equal(statusForProposalAction("approve"), "approved");
  assert.equal(statusForProposalAction("request_changes"), "changes_requested");
  assert.equal(statusForProposalAction("block"), "blocked");
  assert.equal(statusForProposalAction("revise", "needs_review"), "needs_review");
  assert.equal(statusForProposalAction("revise", "approved"), "approved");
  assert.equal(statusForProposalAction("unknown", "needs_review"), "needs_review");
});

test("triageForFeedbackAction maps every triage verdict", () => {
  assert.equal(triageForFeedbackAction("assign"), "clustered");
  assert.equal(triageForFeedbackAction("ignore"), "ignored");
  assert.equal(triageForFeedbackAction("insight"), "insight");
  assert.equal(triageForFeedbackAction("unknown", "new"), "new");
});

test("recomputeDerived: request frequency/weighted_score sum from linked feedback, worked example", () => {
  // Worked example mirroring the demo dataset: 3 items linked to req-csv-export
  // with weights 5, 3, 5 (weighted_score = 13), plus one unlinked negative item.
  const snapshot = {
    generated_at: "2026-07-02T09:30:00.000Z",
    feedback: [
      normalizeFeedbackItem({
        feedback_id: "fb-1",
        request_id: "req-csv-export",
        user_weight: 5,
        sentiment: "neutral",
        received_at: "2026-06-29T10:12:00.000Z",
        channel: "email",
        triage: "clustered",
      }),
      normalizeFeedbackItem({
        feedback_id: "fb-2",
        request_id: "req-csv-export",
        user_weight: 3,
        sentiment: "negative",
        received_at: "2026-06-30T15:40:00.000Z",
        channel: "email",
        triage: "clustered",
      }),
      normalizeFeedbackItem({
        feedback_id: "fb-3",
        request_id: "req-csv-export",
        user_weight: 5,
        sentiment: "positive",
        received_at: "2026-07-01T09:00:00.000Z",
        channel: "survey",
        triage: "clustered",
      }),
      normalizeFeedbackItem({
        feedback_id: "fb-4",
        request_id: "",
        user_weight: 1,
        sentiment: "negative",
        received_at: "2026-07-02T08:40:00.000Z",
        channel: "discord",
        triage: "new",
      }),
    ],
    requests: [normalizeRequestItem({ request_id: "req-csv-export", title: "CSV export" })],
    proposals: [],
  };
  recomputeDerived(snapshot);
  const request = snapshot.requests[0];
  assert.equal(request.frequency, 3);
  assert.equal(request.weighted_score, 13);
  assert.equal(snapshot.metrics.feedback_count, 4);
  assert.equal(snapshot.metrics.new_feedback, 1);
  assert.equal(snapshot.metrics.sentiment.negative, 2);
  assert.equal(snapshot.metrics.sentiment.positive, 1);
  assert.equal(snapshot.metrics.sentiment.neutral, 1);
  // week_inflow keys by channel within 7 days of generated_at.
  assert.equal(snapshot.metrics.week_inflow.email, 2);
  assert.equal(snapshot.metrics.week_inflow.survey, 1);
  assert.equal(snapshot.metrics.week_inflow.discord, 1);
});

test("recomputeDerived: resets frequency/weighted_score before recomputing (idempotent re-merge)", () => {
  const snapshot = {
    generated_at: "2026-07-02T09:30:00.000Z",
    feedback: [
      normalizeFeedbackItem({
        feedback_id: "fb-1",
        request_id: "req-a",
        user_weight: 5,
        received_at: "2026-07-01T00:00:00.000Z",
      }),
    ],
    requests: [{ ...normalizeRequestItem({ request_id: "req-a", title: "A" }), frequency: 99, weighted_score: 999 }],
    proposals: [],
  };
  recomputeDerived(snapshot);
  assert.equal(snapshot.requests[0].frequency, 1);
  assert.equal(snapshot.requests[0].weighted_score, 5);
});

test("buildSnapshot: normalizes raw Busabase rows, groups roadmap by lane, assigns stable proposal refs by created_at", () => {
  const snapshot = buildSnapshot({
    products: [{ product_id: "pulseboard", display_name: "PulseBoard" }],
    sources: [{ source_id: "support-email", channel: "email", name: "Support inbox" }],
    feedback: [
      {
        feedback_id: "fb-1",
        source_id: "support-email",
        channel: "email",
        request_id: "req-a",
        user_weight: 3,
        received_at: "2026-07-01T00:00:00.000Z",
      },
    ],
    requests: [{ request_id: "req-a", title: "Request A", representative_feedback_ids: JSON.stringify(["fb-1"]) }],
    roadmap: [{ item_id: "rm-1", lane: "now", title: "Ship it", request_id: "req-a" }],
    proposals: [
      normalizeProposal({ proposal_id: "prop-b", title: "B", created_at: "2026-07-02T00:00:00.000Z" }),
      normalizeProposal({ proposal_id: "prop-a", title: "A", created_at: "2026-07-01T00:00:00.000Z" }),
    ],
    sync_log: [{ sync_id: "s1", at: "2026-07-01T00:00:00.000Z", actor: "kelly-feedback", action: "ingest" }],
  });
  assert.equal(snapshot.products[0].display_name, "PulseBoard");
  assert.equal(snapshot.roadmap.now.length, 1);
  assert.equal(snapshot.roadmap.now[0].item_id, "rm-1");
  assert.equal(snapshot.roadmap.next.length, 0);
  assert.equal(snapshot.requests[0].representative_feedback_ids[0], "fb-1");
  assert.equal(snapshot.requests[0].frequency, 1);
  assert.equal(snapshot.requests[0].weighted_score, 3);
  // prop-a was created first -> ref 1; prop-b -> ref 2, regardless of read order.
  const propA = snapshot.proposals.find((p) => p.proposal_id === "prop-a");
  const propB = snapshot.proposals.find((p) => p.proposal_id === "prop-b");
  assert.equal(propA.ref, 1);
  assert.equal(propB.ref, 2);
});

test("buildConfigSummary: never exposes secret values, only env-var names and a status-derived readiness proxy", () => {
  const summary = buildConfigSummary({
    settings: {
      plan_weights: JSON.stringify({ free: 1, pro: 3, team: 5 }),
      default_weight: 1,
      recency_half_life_days: 30,
      roadmap_lanes: JSON.stringify(["now", "next", "later"]),
    },
    products: [{ product_id: "pulseboard", display_name: "PulseBoard" }],
    sources: [
      {
        source_id: "x-mentions",
        channel: "x",
        name: "X replies",
        secret_envs: JSON.stringify(["X_TOKEN"]),
        status: "ok",
      },
      { source_id: "appstore-reviews", channel: "appstore", name: "App Store", status: "ok" },
    ],
  });
  assert.deepEqual(summary.scoring.plan_weights, { free: 1, pro: 3, team: 5 });
  assert.deepEqual(summary.roadmap_lanes, ["now", "next", "later"]);
  const x = summary.sources.find((s) => s.source_id === "x-mentions");
  assert.deepEqual(x.secret_envs, ["X_TOKEN"]);
  assert.equal(x.secrets_ready, true);
  const appstore = summary.sources.find((s) => s.source_id === "appstore-reviews");
  assert.deepEqual(appstore.secret_envs, []);
  assert.equal(appstore.secrets_ready, true);
});
