import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_STATUS,
  EVENTS,
  PERSONAS,
  PIPELINES,
  QA_CHECKS,
  VENDORS,
  buildDecision,
  buildSnapshot,
  computeMetrics,
  decisionToFields,
  decisionsToMap,
  effectiveStatus,
  normalizeDecisionRow,
} from "../app/js/digital-human-model.js";

test("QA_CHECKS is ported verbatim from the retired app/server/demo.ts (8 checks, 6 pass / 2 fix)", () => {
  assert.equal(QA_CHECKS.length, 8);
  assert.deepEqual(
    QA_CHECKS.map((check) => check.id),
    ["lip-sync", "latency", "ai-disclosure", "voice-consent", "script-safety", "fallback", "privacy", "mobile"],
  );
  assert.equal(QA_CHECKS.filter((check) => check.status === "pass").length, 6);
  assert.equal(QA_CHECKS.filter((check) => check.status === "fix").length, 2);
});

test("PERSONAS/PIPELINES/VENDORS/EVENTS counts match the retired demo dataset", () => {
  assert.equal(PERSONAS.length, 2);
  assert.equal(PIPELINES.length, 2);
  assert.equal(VENDORS.length, 4);
  assert.equal(EVENTS.length, 5);
});

test("computeMetrics derives qa_passed/qa_total from QA_CHECKS's curated status (replaces demo.ts's hardcoded 6/8)", () => {
  assert.deepEqual(computeMetrics(QA_CHECKS), { qa_passed: 6, qa_total: 8 });
  assert.deepEqual(computeMetrics([]), { qa_passed: 0, qa_total: 0 });
  assert.deepEqual(computeMetrics([{ status: "fix" }, { status: "fix" }]), { qa_passed: 0, qa_total: 2 });
});

test("buildSnapshot merges curated static metrics with computeMetrics's derived counts", () => {
  const snapshot = buildSnapshot(QA_CHECKS, { scene: "overview", generated_at: "2026-07-07T09:30:00.000Z" });
  assert.equal(snapshot.scene, "overview");
  assert.equal(snapshot.generated_at, "2026-07-07T09:30:00.000Z");
  assert.deepEqual(snapshot.metrics, {
    target_latency_ms: 850,
    current_latency_ms: 620,
    lip_sync_score: 92,
    stream_stability: 98,
    qa_passed: 6,
    qa_total: 8,
  });
  assert.equal(snapshot.qa_checks, QA_CHECKS);
});

test("effectiveStatus: a recorded decision always wins over the check's curated baseline status", () => {
  assert.equal(effectiveStatus({ status: "pass" }, null), "approved");
  assert.equal(effectiveStatus({ status: "fix" }, null), "needs_review");
  assert.equal(effectiveStatus({ status: "pass" }, { action: "block" }), "blocked");
  assert.equal(effectiveStatus({ status: "fix" }, { action: "approve" }), "approved");
  assert.equal(effectiveStatus({ status: "fix" }, { action: "request_changes" }), "changes_requested");
  // An unrecognized/empty decision action falls back to the curated status.
  assert.equal(effectiveStatus({ status: "pass" }, { action: "" }), "approved");
});

test("DECISION_STATUS maps every allowed action to its display status", () => {
  assert.deepEqual(DECISION_STATUS, { approve: "approved", request_changes: "changes_requested", block: "blocked" });
});

test("buildDecision/decisionToFields/normalizeDecisionRow round-trip a QA decision", () => {
  const decision = buildDecision({ check_id: "voice-consent", action: "approve", note: "Signed release on file." });
  assert.equal(decision.check_id, "voice-consent");
  assert.equal(decision.action, "approve");
  assert.equal(decision.note, "Signed release on file.");
  assert.ok(decision.decided_at);

  const fields = decisionToFields(decision);
  assert.deepEqual(fields, {
    "check-id": "voice-consent",
    action: "approve",
    note: "Signed release on file.",
    "decided-at": decision.decided_at,
  });

  const row = normalizeDecisionRow({
    check_id: fields["check-id"],
    action: fields.action,
    note: fields.note,
    decided_at: fields["decided-at"],
  });
  assert.deepEqual(row, decision);
});

test("decisionsToMap builds a sparse check_id -> decision map, mirroring the retired decisions.json bucket", () => {
  const decisions = [
    buildDecision({ check_id: "lip-sync", action: "approve", decided_at: "2026-07-01T00:00:00.000Z" }),
    buildDecision({ check_id: "fallback", action: "block", decided_at: "2026-07-02T00:00:00.000Z" }),
  ];
  const map = decisionsToMap(decisions);
  assert.deepEqual(Object.keys(map).sort(), ["fallback", "lip-sync"]);
  assert.equal(map["lip-sync"].action, "approve");
  assert.equal(map.fallback.action, "block");
  // A check with no decision yet is simply absent from the map.
  assert.equal(map.latency, undefined);
});

test("decisionsToMap ignores rows with no check_id", () => {
  assert.deepEqual(decisionsToMap([{ check_id: "", action: "approve" }]), {});
});
