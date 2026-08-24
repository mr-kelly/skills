import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, checkSuppression, deliverabilityInfo, statusForAction } from "../app/js/campaigns-model.js";

test("deliverabilityInfo derives risk from auth/spam/inbox thresholds", () => {
  // Clean auth, low spam, high inbox readiness -> low risk.
  assert.equal(
    deliverabilityInfo({ spf_pass: true, dkim_pass: true, dmarc_pass: true, spam_score: 0.6, inbox_readiness: 0.97 })
      .risk,
    "low",
  );
  // Spam score at the medium floor (>= 3) -> medium.
  assert.equal(
    deliverabilityInfo({ spf_pass: true, dkim_pass: true, dmarc_pass: true, spam_score: 3.2, inbox_readiness: 0.85 })
      .risk,
    "medium",
  );
  // Inbox readiness below 0.8 -> medium, even with a clean spam score.
  assert.equal(
    deliverabilityInfo({ spf_pass: true, dkim_pass: true, dmarc_pass: true, spam_score: 1, inbox_readiness: 0.75 })
      .risk,
    "medium",
  );
  // Failing auth alone forces high risk regardless of spam/inbox numbers.
  assert.equal(
    deliverabilityInfo({ spf_pass: true, dkim_pass: false, dmarc_pass: false, spam_score: 0.5, inbox_readiness: 0.99 })
      .risk,
    "high",
  );
  // Spam score at the high floor (>= 5) -> high.
  assert.equal(
    deliverabilityInfo({ spf_pass: true, dkim_pass: true, dmarc_pass: true, spam_score: 6.8, inbox_readiness: 0.41 })
      .risk,
    "high",
  );
});

test("checkSuppression: address-level entries are global, segment-level entries scope to the segment", () => {
  const entries = [
    { address: "unsub-1@example.com", reason: "unsubscribe" },
    { address: "bounced-1@example.com", reason: "hard_bounce" },
    { segment_id: "lapsed-90d", reason: "complaint" },
  ];
  // Full list send: only the 2 global address entries match, nothing blocks.
  const flashSale = checkSuppression({ segment_id: "all-subscribers", target_addresses: [] }, entries);
  assert.equal(flashSale.suppressed_count, 2);
  assert.equal(flashSale.blocked, false);

  // Lapsed-segment send explicitly targeting a suppressed address: segment
  // match + 2 global matches = 3, and the explicit address target blocks it.
  const winback = checkSuppression({ segment_id: "lapsed-90d", target_addresses: ["unsub-1@example.com"] }, entries);
  assert.equal(winback.suppressed_count, 3);
  assert.equal(winback.blocked, true);
});

test("statusForAction maps every decision verdict", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction("unknown"), null);
});

test("buildSnapshot computes metrics, at-risk count, and quality-gate warnings", () => {
  const snapshot = buildSnapshot({
    segments: [{ segment_id: "all-subscribers", name: "All subscribers", audience_size: 100 }],
    sends: [
      {
        send_id: "send-a",
        ref: 1,
        segment_id: "all-subscribers",
        status: "needs_review",
        deliverability: { spf_pass: true, dkim_pass: true, dmarc_pass: true, spam_score: 1, inbox_readiness: 0.95 },
      },
      {
        send_id: "send-b",
        ref: 2,
        segment_id: "all-subscribers",
        status: "approved",
        deliverability: { spf_pass: true, dkim_pass: true, dmarc_pass: true, spam_score: 1, inbox_readiness: 0.95 },
      },
      {
        send_id: "send-c",
        ref: 3,
        subject: "We miss you",
        segment_id: "all-subscribers",
        status: "needs_review",
        deliverability: { spf_pass: true, dkim_pass: false, dmarc_pass: false, spam_score: 6.8, inbox_readiness: 0.41 },
        quality_gate: { eqs: 38, verdict: "block", summary: "Auth fails." },
      },
    ],
    suppression: [],
  });

  assert.equal(snapshot.metrics.needs_review, 2);
  assert.equal(snapshot.metrics.approved, 1);
  assert.equal(snapshot.metrics.scheduled, 1);
  assert.equal(snapshot.metrics.at_risk, 1);
  assert.equal(snapshot.warnings.length, 1);
  assert.equal(snapshot.warnings[0].send_id, "send-c");
  assert.match(snapshot.warnings[0].message, /We miss you/);
});

test("buildSnapshot attaches a computed suppression check to every send", () => {
  const snapshot = buildSnapshot({
    segments: [],
    sends: [
      {
        send_id: "send-winback",
        ref: 1,
        segment_id: "lapsed-90d",
        status: "needs_review",
        target_addresses: ["complaint-1@example.com"],
      },
    ],
    suppression: [{ address: "complaint-1@example.com", reason: "complaint" }],
  });
  assert.equal(snapshot.sends[0].suppression.blocked, true);
  assert.equal(snapshot.sends[0].suppression.suppressed_count, 1);
});
