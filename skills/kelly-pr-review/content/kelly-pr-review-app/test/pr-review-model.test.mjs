import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSnapshot,
  countByWorkflow,
  isApprovedForExecution,
  isBlocked,
  isDone,
  matchesMode,
  matchesSearch,
  reposFor,
  statusForAction,
} from "../app/js/pr-review-model.js";

test("statusForAction maps every decision action, ported from local-file-provider.ts", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("comment"), "approved");
  assert.equal(statusForAction("request_changes"), "approved");
  assert.equal(statusForAction("no_action"), "approved");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("needs_review"), "needs_review");
  assert.equal(statusForAction("unknown"), "needs_review");
});

test("isApprovedForExecution excludes items already executed to done", () => {
  assert.equal(isApprovedForExecution({ status: "approved" }), true);
  assert.equal(isApprovedForExecution({ status: "approved", execution_status: "executed" }), false);
  assert.equal(isApprovedForExecution({ status: "done" }), false);
  assert.equal(isDone({ status: "approved", execution_status: "executed" }), true);
  assert.equal(isBlocked({ status: "blocked" }), true);
  assert.equal(isBlocked({ status: "needs_review" }), false);
});

test("matchesMode buckets an item into exactly the modes it belongs to", () => {
  const merged = { status: "merged", verification_status: "needs_test" };
  assert.equal(matchesMode(merged, "needs_test"), true);
  assert.equal(matchesMode(merged, "tested"), false);
  assert.equal(matchesMode(merged, "all"), true);
  const approved = { status: "approved" };
  assert.equal(matchesMode(approved, "approved"), true);
  assert.equal(matchesMode(approved, "needs_review"), false);
});

test("matchesSearch matches ref/repo/number/title/author/summary case-insensitively", () => {
  const item = { review_ref: "Review #1", repo: "octo/app", number: 42, title: "Fix bug", author: "mona", summary: "" };
  assert.equal(matchesSearch(item, "MONA"), true);
  assert.equal(matchesSearch(item, "octo/app"), true);
  assert.equal(matchesSearch(item, "42"), true);
  assert.equal(matchesSearch(item, "nope"), false);
  assert.equal(matchesSearch(item, ""), true);
});

test("reposFor counts and sorts repos alphabetically", () => {
  const items = [{ repo: "b/two" }, { repo: "a/one" }, { repo: "a/one" }, { repo: "" }];
  assert.deepEqual(reposFor(items), [
    { repo: "a/one", count: 2 },
    { repo: "b/two", count: 1 },
  ]);
});

test("countByWorkflow reproduces local-file-provider.ts's bucket counts on a worked example", () => {
  const items = [
    { status: "needs_review" },
    { status: "to_approve" },
    { status: "approved" },
    { status: "approved", execution_status: "executed" }, // counts as done, not approved
    { status: "blocked" },
    { status: "merged", verification_status: "needs_test" },
    { status: "merged", verification_status: "tested" },
  ];
  assert.deepEqual(countByWorkflow(items), {
    needs_review: 1,
    to_approve: 1,
    approved: 1,
    done: 1,
    blocked: 1,
    needs_test: 1,
    tested: 1,
  });
});

test("buildSnapshot normalizes raw Busabase rows, parses JSON fields, and assigns stable review refs", () => {
  const records = [
    {
      item_id: "octo/app#2",
      repo: "octo/app",
      number: 2,
      title: "Second PR",
      status: "needs_review",
      risk: '["security"]',
      labels: '["backend"]',
      changed_files: '["a.ts","b.ts"]',
      created_at: "2026-01-02T00:00:00.000Z",
      updated_at: "2026-01-02T01:00:00.000Z",
    },
    {
      item_id: "octo/app#1",
      repo: "octo/app",
      number: 1,
      title: "First PR",
      status: "merged",
      merged: "true",
      tested: "true",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T05:00:00.000Z",
    },
  ];
  const snapshot = buildSnapshot({ records });
  assert.equal(snapshot.items.length, 2);
  // Sorted by updated_at desc for display: the Jan 2 item comes first.
  assert.equal(snapshot.items[0].id, "octo/app#2");
  assert.deepEqual(snapshot.items[0].risk, ["security"]);
  assert.deepEqual(snapshot.items[0].changed_files, ["a.ts", "b.ts"]);
  // Review refs are assigned by created_at ascending: octo/app#1 (Jan 1) is Review #1.
  assert.equal(snapshot.items.find((item) => item.id === "octo/app#1").review_ref, "Review #1");
  assert.equal(snapshot.items.find((item) => item.id === "octo/app#2").review_ref, "Review #2");
  assert.equal(snapshot.items.find((item) => item.id === "octo/app#1").verification_status, "tested");
  assert.deepEqual(snapshot.metrics, {
    needs_review: 1,
    to_approve: 0,
    approved: 0,
    done: 0,
    blocked: 0,
    needs_test: 0,
    tested: 1,
  });
  assert.deepEqual(snapshot.repos, [{ repo: "octo/app", count: 2 }]);
});
