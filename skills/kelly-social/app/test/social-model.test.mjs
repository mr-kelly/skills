import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDraftApprovable,
  assertDraftPublishable,
  assertReplySendable,
  assertReviewStatus,
  buildSnapshot,
  evaluateGate,
  normalizeDraft,
  rollup,
} from "../app/js/social-model.js";

test("evaluateGate: clean copy ships", () => {
  const gate = evaluateGate({
    hook: "Week 27, and the boring middle keeps paying rent.",
    body: "MRR $4,460 (+6%), churn 1.6%.",
    hashtags: ["#buildinpublic"],
    cta: "Reply with your week-27 number.",
  });
  assert.equal(gate.verdict, "SHIP");
  assert.equal(gate.score, 100);
  assert.ok(gate.checks.every((check) => check.result === "pass"));
});

test("evaluateGate: a thin hook is a soft warning -> FIX", () => {
  const gate = evaluateGate({ hook: "New drop", body: "Something is coming.", hashtags: [], cta: "" });
  assert.equal(gate.verdict, "FIX");
  assert.equal(gate.score, 85);
  const voice = gate.checks.find((check) => check.id === "brand-voice");
  assert.equal(voice.result, "warn");
});

test("evaluateGate: a banned claim plus undisclosed promo -> BLOCK", () => {
  // Mirrors the retired demo.ts's draft-5 fixture: an absolute claim AND a
  // promotional read with no #ad/#sponsored disclosure marker.
  const gate = evaluateGate({
    hook: "Kelly Money v0.5 is the #1 in the world, GUARANTEED to be 100% secure.",
    body: "Sponsored launch push: the best invoicing tool ever made, risk-free, guaranteed results. Sign up now.",
    hashtags: [],
    cta: "Buy now.",
  });
  assert.equal(gate.verdict, "BLOCK");
  const banned = gate.checks.find((check) => check.id === "banned-claims");
  const disclosure = gate.checks.find((check) => check.id === "disclosure");
  assert.equal(banned.result, "fail");
  assert.equal(disclosure.result, "fail");
  // 2 fails * 40 = 80 off; brand-voice also warns (shouting) for another 15.
  assert.equal(gate.score, 5);
});

test("evaluateGate: promo copy WITH a disclosure marker passes the disclosure check", () => {
  const gate = evaluateGate({
    hook: "Partnering with a roaster I actually love this month.",
    body: "This is a paid partnership post about the new blend.",
    hashtags: ["#sponsored"],
    cta: "",
  });
  const disclosure = gate.checks.find((check) => check.id === "disclosure");
  assert.equal(disclosure.result, "pass");
});

test("normalizeDraft: a gate BLOCK forces status to blocked regardless of stored status", () => {
  const draft = normalizeDraft({
    draft_id: "draft-5",
    hook: "Kelly Money v0.5 is the #1 in the world, GUARANTEED to be 100% secure.",
    body: "Sponsored launch push: risk-free, guaranteed results.",
    status: "needs_review",
  });
  assert.equal(draft.gate.verdict, "BLOCK");
  assert.equal(draft.status, "blocked");
});

test("normalizeDraft: a clean draft keeps its stored status", () => {
  const draft = normalizeDraft({
    draft_id: "draft-3",
    hook: "Something new is matching your invoices while you sleep.",
    body: "Kelly Money v0.5 teaser.",
    status: "approved",
  });
  assert.equal(draft.gate.verdict, "SHIP");
  assert.equal(draft.status, "approved");
});

test("rollup: sums followers/impressions and derives a weighted engagement rate", () => {
  const accounts = [
    {
      metrics: {
        followers: 100,
        followers_delta_7d: 10,
        followers_delta_28d: 20,
        impressions_7d: 1000,
        engagements_7d: 50,
      },
    },
    {
      metrics: {
        followers: 200,
        followers_delta_7d: 5,
        followers_delta_28d: 15,
        impressions_7d: 500,
        engagements_7d: 25,
      },
    },
  ];
  const totals = rollup(accounts, [{}, {}, {}]);
  assert.equal(totals.account_count, 2);
  assert.equal(totals.post_count, 3);
  assert.equal(totals.total_followers, 300);
  assert.equal(totals.followers_delta_7d, 15);
  assert.equal(totals.followers_delta_28d, 35);
  assert.equal(totals.impressions_7d, 1500);
  assert.equal(totals.engagements_7d, 75);
  assert.equal(totals.engagement_rate_7d, 0.05);
});

test("assertReviewStatus: rejects anything outside the five-state model", () => {
  assert.equal(assertReviewStatus("approved"), "approved");
  assert.throws(() => assertReviewStatus("archived"), /Invalid review status/);
});

test("assertDraftApprovable / assertDraftPublishable: BLOCK gate overrides everything", () => {
  const blocked = { status: "needs_review", gate: { verdict: "BLOCK" } };
  assert.throws(() => assertDraftApprovable(blocked), /social-qa gate BLOCKed/);
  assert.throws(() => assertDraftPublishable(blocked), /social-qa gate BLOCKed/);

  const notApproved = { status: "needs_review", gate: { verdict: "SHIP" } };
  assert.throws(() => assertDraftPublishable(notApproved), /has not been human-approved/);

  const ready = { status: "approved", gate: { verdict: "SHIP" } };
  assert.doesNotThrow(() => assertDraftApprovable(ready));
  assert.doesNotThrow(() => assertDraftPublishable(ready));
});

test("assertReplySendable: requires prior human approval", () => {
  assert.throws(() => assertReplySendable({ status: "needs_review" }), /has not been human-approved/);
  assert.doesNotThrow(() => assertReplySendable({ status: "approved" }));
});

test("buildSnapshot: derives warnings from non-ok account status, never a separate store", () => {
  const snapshot = buildSnapshot({
    accounts: [
      { account_id: "x-kelly", platform: "x", handle: "@kellyships", status: "ok", metrics: "{}" },
      {
        account_id: "ig-kelly",
        platform: "instagram",
        handle: "@kelly.ships",
        status: "warning",
        notes: "Export older than 7 days.",
        metrics: "{}",
      },
    ],
    posts: [],
  });
  assert.equal(snapshot.warnings.length, 1);
  assert.equal(snapshot.warnings[0].account_id, "ig-kelly");
  assert.equal(snapshot.warnings[0].severity, "warning");
  assert.equal(snapshot.warnings[0].message, "Export older than 7 days.");
  assert.equal(snapshot.metrics.account_count, 2);
});

test("buildSnapshot: parses JSON longtext fields for metrics/follower-series/tags", () => {
  const snapshot = buildSnapshot({
    accounts: [
      {
        account_id: "x-kelly",
        platform: "x",
        handle: "@kellyships",
        metrics: JSON.stringify({ followers: 12480, followers_delta_7d: 412 }),
        follower_series: JSON.stringify([{ date: "2026-07-01", followers: 12480 }]),
      },
    ],
    posts: [
      {
        post_id: "x-1",
        platform: "x",
        account_id: "x-kelly",
        posted_at: "2026-07-02T08:05:00.000Z",
        metrics: JSON.stringify({ likes: 10, replies: 2, reposts: 1, views: 100 }),
        // engagement_rate is computed and stored at ingest time (see
        // scripts/ingest_snapshot.mjs's normalizePost()), not re-derived on
        // every read — normalizePost() here just parses the stored value.
        engagement_rate: 0.13,
        tags: JSON.stringify(["launch"]),
      },
    ],
  });
  assert.equal(snapshot.accounts[0].metrics.followers, 12480);
  assert.equal(snapshot.accounts[0].follower_series[0].followers, 12480);
  assert.equal(snapshot.posts[0].tags[0], "launch");
  assert.equal(snapshot.posts[0].engagement_rate, 0.13);
});
