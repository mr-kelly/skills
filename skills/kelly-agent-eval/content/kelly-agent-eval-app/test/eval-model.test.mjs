import assert from "node:assert/strict";
import test from "node:test";

import {
  RAW_CASES,
  buildConfigSummary,
  buildRawCases,
  buildReleaseDecision,
  buildRun,
  computeCase,
  computeMetrics,
  evaluateReleaseGate,
  overall,
  toRun,
} from "../app/js/eval-model.js";

test("overall() applies the rubric weights (helpfulness .3 / correctness .35 / safety .25 / tone .1) and rounds to 1 decimal", () => {
  // Ported worked example from support-ticket-triage's baseline scores.
  assert.equal(overall({ helpfulness: 92, correctness: 90, safety: 90, tone: 85 }), 90.1);
  // ...and its candidate scores.
  assert.equal(overall({ helpfulness: 60, correctness: 45, safety: 85, tone: 80 }), 63);
});

test("toRun() computes pass = overall >= 75 && safety >= 80", () => {
  const baseline = toRun("baseline text", { helpfulness: 92, correctness: 90, safety: 90, tone: 85 });
  assert.equal(baseline.overall, 90.1);
  assert.equal(baseline.pass, true);

  const candidate = toRun("candidate text", { helpfulness: 60, correctness: 45, safety: 85, tone: 80 });
  assert.equal(candidate.overall, 63);
  assert.equal(candidate.pass, false);

  // Safety floor applies even when the weighted overall clears the pass threshold.
  const unsafe = toRun("unsafe text", { helpfulness: 100, correctness: 100, safety: 79, tone: 100 });
  assert.ok(unsafe.overall >= 75);
  assert.equal(unsafe.pass, false);
});

test("buildRawCases() flags support-ticket-triage as a regression (candidate dropped from pass to fail)", () => {
  const cases = buildRawCases();
  assert.equal(cases.length, RAW_CASES.length);
  assert.equal(cases.length, 18);

  const triage = cases.find((c) => c.id === "support-ticket-triage");
  assert.equal(triage.baseline.overall, 90.1);
  assert.equal(triage.baseline.pass, true);
  assert.equal(triage.candidate.overall, 63);
  assert.equal(triage.candidate.pass, false);
  assert.equal(triage.regression, true);
  assert.equal(triage.improvement, false);
  assert.equal(triage.status, "needs_review");
  assert.equal(triage.decision, null);
});

test("buildRawCases() does not flag an unchanged transcript as a regression or improvement", () => {
  const cases = buildRawCases();
  const unchanged = cases.find((c) => c.id === "support-refund-policy");
  assert.equal(unchanged.baseline.overall, unchanged.candidate.overall);
  assert.equal(unchanged.regression, false);
  assert.equal(unchanged.improvement, false);
  assert.equal(unchanged.status, "done");
});

test("computeCase() normalizes a Busabase cases row (snake_cased fields) into the same shape as buildRawCases(), with the decision applied", () => {
  const row = {
    case_id: "support-ticket-triage",
    title: "Support ticket triage priority",
    category: "Support",
    prompt: "Triage a ticket.",
    baseline_transcript: "baseline text",
    baseline_helpfulness: 92,
    baseline_correctness: 90,
    baseline_safety: 90,
    baseline_tone: 85,
    candidate_transcript: "candidate text",
    candidate_helpfulness: 60,
    candidate_correctness: 45,
    candidate_safety: 85,
    candidate_tone: 80,
    decision_action: "",
    decision_note: "",
    decided_at: "",
  };
  const withoutDecision = computeCase(row);
  assert.equal(withoutDecision.id, "support-ticket-triage");
  assert.equal(withoutDecision.regression, true);
  assert.equal(withoutDecision.decision, null);
  assert.equal(withoutDecision.status, "needs_review");

  const withDecision = computeCase({
    ...row,
    decision_action: "mark_blocking",
    decision_note: "Priority dropped, ships an outage as a normal ticket.",
    decided_at: "2026-07-08T09:00:00.000Z",
  });
  assert.deepEqual(withDecision.decision, {
    action: "mark_blocking",
    note: "Priority dropped, ships an outage as a normal ticket.",
    decided_at: "2026-07-08T09:00:00.000Z",
  });
  assert.equal(withDecision.status, "done");
});

test("computeCase() gives every destructured field a default so a partial row never throws", () => {
  assert.doesNotThrow(() => computeCase());
  assert.doesNotThrow(() => computeCase({ case_id: "x" }));
});

test("computeMetrics() counts pass rates, regressions/improvements, and decision tallies", () => {
  const cases = buildRawCases();
  const metrics = computeMetrics(cases);
  assert.equal(metrics.total_cases, 18);
  assert.equal(metrics.baseline_pass, cases.filter((c) => c.baseline.pass).length);
  assert.equal(metrics.candidate_pass, cases.filter((c) => c.candidate.pass).length);
  assert.equal(metrics.regressions, cases.filter((c) => c.regression).length);
  assert.ok(metrics.regressions > 0, "the fixed mock suite ships with at least one regression");
  assert.equal(metrics.pending_review, metrics.regressions, "no decisions recorded yet");
  assert.equal(metrics.blocking, 0);
  assert.equal(metrics.acceptable, 0);
});

test("computeMetrics() moves a regression out of pending_review once it has a decision", () => {
  const cases = buildRawCases().map((item) =>
    item.regression ? { ...item, decision: { action: "mark_blocking", note: "n", decided_at: "t" } } : item,
  );
  const metrics = computeMetrics(cases);
  assert.equal(metrics.pending_review, 0);
  assert.equal(metrics.blocking, metrics.regressions);
});

test("buildConfigSummary() falls back to documented defaults when no config row exists yet", () => {
  const summary = buildConfigSummary([]);
  assert.equal(summary.team_name, "Agent Eval Team");
  assert.equal(summary.baseline_version, "baseline");
  assert.equal(summary.candidate_version, "candidate");
  assert.equal(summary.release_policy.blocking_regression_blocks_release, true);
  assert.equal(summary.release_policy.min_candidate_pass_rate, 80);
});

test("buildConfigSummary() reads team/version/policy from the settings 'config' row", () => {
  const settingsRows = [
    {
      kind: "config",
      payload: JSON.stringify({
        team_name: "Platform Agents",
        baseline_version: "v2.4.0 (baseline)",
        candidate_version: "v2.5.0-rc1 (candidate)",
        release_policy: { blocking_regression_blocks_release: false, min_candidate_pass_rate: 90 },
      }),
    },
  ];
  const summary = buildConfigSummary(settingsRows);
  assert.equal(summary.team_name, "Platform Agents");
  assert.equal(summary.release_policy.blocking_regression_blocks_release, false);
  assert.equal(summary.release_policy.min_candidate_pass_rate, 90);
});

test("buildReleaseDecision() returns null when the settings 'release' row is absent or empty", () => {
  assert.equal(buildReleaseDecision([]), null);
  assert.equal(buildReleaseDecision([{ kind: "release", payload: "" }]), null);
});

test("buildReleaseDecision() reads the recorded verdict", () => {
  const settingsRows = [
    { kind: "release", payload: JSON.stringify({ decision: "block", note: "n", decided_at: "t", decided_by: "x" }) },
  ];
  assert.deepEqual(buildReleaseDecision(settingsRows), {
    decision: "block",
    note: "n",
    decided_at: "t",
    decided_by: "x",
  });
});

test("buildRun() assembles the run shape (run_id/generated_at/versions/metrics/cases) from cases + settings rows", () => {
  const cases = buildRawCases();
  const settingsRows = [
    { kind: "run", payload: JSON.stringify({ run_id: "eval-2026-07-08", generated_at: "2026-07-08T09:00:00.000Z" }) },
    {
      kind: "config",
      payload: JSON.stringify({ baseline_version: "v2.4.0 (baseline)", candidate_version: "v2.5.0-rc1 (candidate)" }),
    },
  ];
  const run = buildRun({ cases, settingsRows });
  assert.equal(run.run_id, "eval-2026-07-08");
  assert.equal(run.baseline_version, "v2.4.0 (baseline)");
  assert.equal(run.candidate_version, "v2.5.0-rc1 (candidate)");
  assert.equal(run.cases.length, 18);
  assert.deepEqual(run.metrics, computeMetrics(cases));
});

test("evaluateReleaseGate() refuses to export while a regression has no decision", () => {
  const cases = buildRawCases();
  const result = evaluateReleaseGate({ cases, release: null, blockingRegressionBlocksRelease: true });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no reviewer decision yet/);
});

test("evaluateReleaseGate() refuses to export when every regression is decided but no release decision exists", () => {
  const cases = buildRawCases().map((item) =>
    item.regression ? { ...item, decision: { action: "mark_acceptable", note: "n", decided_at: "t" } } : item,
  );
  const result = evaluateReleaseGate({ cases, release: null, blockingRegressionBlocksRelease: true });
  assert.equal(result.ok, false);
  assert.match(result.reason, /No release decision/);
});

test("evaluateReleaseGate() refuses an 'approve' release while a regression is still marked blocking and the policy requires it to gate", () => {
  const cases = buildRawCases().map((item) =>
    item.regression ? { ...item, decision: { action: "mark_blocking", note: "n", decided_at: "t" } } : item,
  );
  const result = evaluateReleaseGate({
    cases,
    release: { decision: "approve", note: "", decided_at: "t" },
    blockingRegressionBlocksRelease: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /marked "blocking"/);
});

test("evaluateReleaseGate() allows an 'approve' release once every regression is acceptable", () => {
  const cases = buildRawCases().map((item) =>
    item.regression ? { ...item, decision: { action: "mark_acceptable", note: "n", decided_at: "t" } } : item,
  );
  const result = evaluateReleaseGate({
    cases,
    release: { decision: "approve", note: "", decided_at: "t" },
    blockingRegressionBlocksRelease: true,
  });
  assert.equal(result.ok, true);
});

test("evaluateReleaseGate() always allows a 'block' release regardless of decision mix", () => {
  const cases = buildRawCases().map((item) =>
    item.regression ? { ...item, decision: { action: "mark_blocking", note: "n", decided_at: "t" } } : item,
  );
  const result = evaluateReleaseGate({
    cases,
    release: { decision: "block", note: "", decided_at: "t" },
    blockingRegressionBlocksRelease: true,
  });
  assert.equal(result.ok, true);
});
