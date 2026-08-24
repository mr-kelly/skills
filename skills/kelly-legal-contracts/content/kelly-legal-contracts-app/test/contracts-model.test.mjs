import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  PLATFORM_FIELD_SHAPES,
  assembleSnapshot,
  buildConfigSummary,
  buildSnapshot,
  computeMetrics,
  configFromSettingsRow,
  evaluateIssue,
  issueExecution,
  issueToReviewItem,
  normalizeContractRow,
  normalizeIssueRow,
  ruleCatalog,
  scoreChecks,
  slugify,
  statusForVerdict,
} from "../app/js/contracts-model.js";

test("statusForVerdict maps every decision action, ported from local-file-provider.ts's applyDecision", () => {
  assert.equal(statusForVerdict("approve"), "approved");
  assert.equal(statusForVerdict("request_changes"), "changes_requested");
  assert.equal(statusForVerdict("block"), "blocked");
  // "revise" only edits fields/note: status stays whatever it was.
  assert.equal(statusForVerdict("revise", "needs_review"), "needs_review");
  assert.equal(statusForVerdict("revise", "approved"), "approved");
  assert.deepEqual([...DECISION_ACTIONS], ["approve", "request_changes", "block", "revise"]);
});

function ndaIssue(fields = {}) {
  return {
    issue_id: "d-test",
    platform: "nda",
    fields: {
      title: "Residuals clause allows personnel to use retained ideas after the NDA ends",
      bullets: ["a", "b", "c", "d", "e"],
      description: "Delete Section 7.",
      search_terms: "Ask counterparty to remove residuals.",
      ...fields,
    },
  };
}

test("evaluateIssue: required_fields fails when a required nda field is missing", () => {
  const issue = ndaIssue({ description: "" });
  const results = evaluateIssue(issue, null, {}, "en", null);
  const check = results.find((item) => item.rule_id === "required_fields");
  assert.equal(check.result, "fail");
  assert.match(check.evidence, /description/);
});

test("evaluateIssue: title_length fails only when the title exceeds the workstream cap", () => {
  const shortTitle = ndaIssue({ title: "Short title" });
  assert.equal(evaluateIssue(shortTitle, null, {}, "en").find((r) => r.rule_id === "title_length").result, "pass");
  const overLong = ndaIssue({ title: "x".repeat(200) });
  const overResult = evaluateIssue(overLong, null, {}, "en").find((r) => r.rule_id === "title_length");
  assert.equal(overResult.result, "fail");
  assert.match(overResult.evidence, /200/);
});

test("evaluateIssue: banned_words fails on a hard-stop term, matches ASCII words with boundaries", () => {
  const config = { banned_words: ["uncapped liability"] };
  const clean = ndaIssue({ description: "Cap liability at fees paid." });
  assert.equal(evaluateIssue(clean, null, config, "en").find((r) => r.rule_id === "banned_words").result, "pass");
  const dirty = ndaIssue({ description: "Customer paper requests uncapped liability across the board." });
  const dirtyResult = evaluateIssue(dirty, null, config, "en").find((r) => r.rule_id === "banned_words");
  assert.equal(dirtyResult.result, "fail");
  assert.match(dirtyResult.evidence, /uncapped liability/);
});

test("evaluateIssue: bullet_count requires exactly the configured number of risk notes", () => {
  const tooFew = ndaIssue({ bullets: ["only one"] });
  assert.equal(evaluateIssue(tooFew, null, {}, "en").find((r) => r.rule_id === "bullet_count").result, "fail");
  const exact = ndaIssue({ bullets: ["1", "2", "3", "4", "5"] });
  assert.equal(evaluateIssue(exact, null, {}, "en").find((r) => r.rule_id === "bullet_count").result, "pass");
});

test("evaluateIssue: search_terms_bytes fails when negotiation notes exceed the byte cap", () => {
  const rules = { platforms: [{ platform: "nda", rules: { search_terms_max_bytes: 10 } }] };
  const over = ndaIssue({ search_terms: "this is definitely over ten bytes" });
  const result = evaluateIssue(over, null, rules, "en").find((r) => r.rule_id === "search_terms_bytes");
  assert.equal(result.result, "fail");
});

test("evaluateIssue: selling_points_count applies only to dpa/tiktok_shop, requires the configured minimum", () => {
  const dpaIssue = {
    issue_id: "d-dpa",
    platform: "dpa",
    fields: { title: "Retention issue", selling_points: ["only one"] },
  };
  const result = evaluateIssue(dpaIssue, null, {}, "en").find((r) => r.rule_id === "selling_points_count");
  assert.equal(result.result, "fail");
  const enough = { ...dpaIssue, fields: { ...dpaIssue.fields, selling_points: ["a", "b", "c"] } };
  assert.equal(evaluateIssue(enough, null, {}, "en").find((r) => r.rule_id === "selling_points_count").result, "pass");
});

test("evaluateIssue: keyword_stuffing warns when a contract watch term repeats past the threshold", () => {
  const contract = { keywords: ["residuals"] };
  const issue = ndaIssue({
    title: "residuals residuals residuals residuals residuals",
    bullets: ["a", "b", "c", "d", "e"],
  });
  const result = evaluateIssue(issue, contract, { keyword_stuffing: { max_repeats: 3 } }, "en").find(
    (r) => r.rule_id === "keyword_stuffing",
  );
  assert.equal(result.result, "warn");
});

test("evaluateIssue: image_checklist warns on a pending document, passes when all are ready", () => {
  const issue = ndaIssue();
  const pending = { images: [{ name: "Redline", status: "needs_edit" }] };
  assert.equal(evaluateIssue(issue, pending, {}, "en").find((r) => r.rule_id === "image_checklist").result, "warn");
  const ready = { images: [{ name: "Redline", status: "ready" }] };
  assert.equal(evaluateIssue(issue, ready, {}, "en").find((r) => r.rule_id === "image_checklist").result, "pass");
});

test("evaluateIssue: claims_registry fails on a hard-stop rule phrase or an unapproved claim in the corpus", () => {
  const claims = {
    claims: [{ claim_id: "c-1", text: "uncapped indemnity for any and all claims", status: "rejected" }],
    rules: [{ rule_id: "r-1", phrase: "perpetual data retention", type: "restricted_phrase" }],
  };
  const clean = ndaIssue();
  assert.equal(
    evaluateIssue(clean, null, {}, "en", claims).find((r) => r.rule_id === "claims_registry").result,
    "pass",
  );
  const hitsRule = ndaIssue({ description: "Vendor insists on perpetual data retention after termination." });
  const ruleResult = evaluateIssue(hitsRule, null, {}, "en", claims).find((r) => r.rule_id === "claims_registry");
  assert.equal(ruleResult.result, "fail");
  assert.deepEqual(ruleResult.refs.rules, ["r-1"]);
  const hitsClaim = ndaIssue({ description: "Customer wants uncapped indemnity for any and all claims." });
  const claimResult = evaluateIssue(hitsClaim, null, {}, "en", claims).find((r) => r.rule_id === "claims_registry");
  assert.equal(claimResult.result, "fail");
  assert.deepEqual(claimResult.refs.claims, ["c-1"]);
});

test("scoreChecks scores pass=1/warn=0.5/fail=0 over resolvable checks", () => {
  assert.equal(scoreChecks([{ result: "pass" }, { result: "pass" }]), 100);
  assert.equal(scoreChecks([{ result: "pass" }, { result: "fail" }]), 50);
  assert.equal(scoreChecks([{ result: "pass" }, { result: "warn" }]), 75);
});

test("computeMetrics counts issues by status/platform and the risk pass rate over resolved checks", () => {
  const snapshot = {
    contracts: [{}, {}],
    issues: [
      { platform: "nda", status: "approved" },
      { platform: "msa", status: "done" },
      { platform: "msa", status: "changes_requested" },
      { platform: "dpa", status: "needs_review" },
    ],
    checks: [{ result: "pass" }, { result: "pass" }, { result: "fail" }],
  };
  const metrics = computeMetrics(snapshot);
  assert.equal(metrics.contract_count, 2);
  assert.equal(metrics.issue_count, 4);
  assert.deepEqual(metrics.issues_by_platform, { nda: 1, msa: 2, dpa: 1 });
  assert.equal(metrics.issues_approved, 2);
  assert.equal(metrics.issues_in_revision, 1);
  assert.equal(metrics.issues_needs_review, 1);
  assert.equal(metrics.checks_failed, 1);
  assert.equal(metrics.compliance_pass_rate, 67);
});

test("issueToReviewItem folds an issue's own review fields into the review-item shape", () => {
  const issue = {
    issue_id: "d-1",
    ref: 3,
    status: "needs_review",
    compliance_summary: "Score 80",
    suggestions: ["Delete residuals"],
    created_at: "2026-01-01T00:00:00.000Z",
  };
  assert.deepEqual(issueToReviewItem(issue), {
    review_id: "d-1",
    ref: 3,
    issue_id: "d-1",
    status: "needs_review",
    compliance_summary: "Score 80",
    suggestions: ["Delete residuals"],
    created_at: "2026-01-01T00:00:00.000Z",
  });
});

test("normalizeContractRow / normalizeIssueRow parse JSON-encoded arrays off a raw Busabase row", () => {
  const contract = normalizeContractRow({
    contract_id: "ct-1",
    ref: 2,
    name: "Acme NDA",
    keywords: JSON.stringify(["residuals", "purpose limitation"]),
    images: JSON.stringify([{ name: "Redline", status: "ready" }]),
  });
  assert.equal(contract.ref, 2);
  assert.deepEqual(contract.keywords, ["residuals", "purpose limitation"]);
  assert.deepEqual(contract.images, [{ name: "Redline", status: "ready" }]);

  const issue = normalizeIssueRow({
    issue_id: "d-1",
    ref: 1,
    platform: "nda",
    bullets: JSON.stringify(["Risk: residuals"]),
    compliance_score: 82,
  });
  assert.deepEqual(issue.fields.bullets, ["Risk: residuals"]);
  assert.equal(issue.compliance_score, 82);
});

test("buildConfigSummary parses JSON-encoded platforms/banned_words off a raw Settings row and sanitizes counts", () => {
  const summary = buildConfigSummary({
    settings: {
      seller_brand: "Nimbus Legal Ops",
      banned_words: JSON.stringify(["uncapped liability", "perpetual data retention"]),
      platforms: JSON.stringify([{ platform: "nda", enabled: true, locales: ["US"], rules: { title_max_chars: 160 } }]),
      keyword_stuffing_max_repeats: "4",
    },
  });
  assert.equal(summary.seller.brand, "Nimbus Legal Ops");
  assert.equal(summary.banned_words_count, 2);
  assert.equal(summary.platforms[0].platform, "nda");
  assert.equal(summary.keyword_stuffing.max_repeats, 4);
});

test("configFromSettingsRow returns the full unsanitized rule-evaluation config", () => {
  const config = configFromSettingsRow({
    banned_words: JSON.stringify(["uncapped liability"]),
    platforms: JSON.stringify([{ platform: "nda", rules: {} }]),
  });
  assert.deepEqual(config.banned_words, ["uncapped liability"]);
  assert.equal(config.platforms[0].platform, "nda");
});

test("assembleSnapshot sorts contracts/issues by ref and folds every issue into review_items", () => {
  const snapshot = assembleSnapshot({
    contracts: [],
    issues: [
      { issue_id: "b", ref: 2, status: "needs_review" },
      { issue_id: "a", ref: 1, status: "approved" },
    ],
    checks: [],
    configSummary: { seller: { brand: "X" } },
  });
  assert.deepEqual(
    snapshot.issues.map((issue) => issue.issue_id),
    ["a", "b"],
  );
  assert.equal(snapshot.review_items.length, 2);
  assert.equal(snapshot.seller.brand, "X");
});

test("buildSnapshot (Busabase-row wrapper) normalizes rows then assembles the same shape as assembleSnapshot", () => {
  const snapshot = buildSnapshot({
    contracts: [{ contract_id: "ct-1", name: "Acme NDA" }],
    issues: [{ issue_id: "d-1", ref: "1", platform: "nda", status: "needs_review", bullets: JSON.stringify(["x"]) }],
    checks: [{ check_id: "chk-1", issue_id: "d-1", rule_id: "bullet_count", result: "fail" }],
    settings: { seller_brand: "Nimbus" },
  });
  assert.equal(snapshot.contracts[0].name, "Acme NDA");
  assert.deepEqual(snapshot.issues[0].fields.bullets, ["x"]);
  assert.equal(snapshot.seller.brand, "Nimbus");
});

test("ruleCatalog returns every rule id with severity and applicable platforms", () => {
  const catalog = ruleCatalog({}, "en");
  assert.equal(catalog.length, 12);
  const claimsRule = catalog.find((rule) => rule.rule_id === "claims_registry");
  assert.equal(claimsRule.severity, "error");
  assert.ok(claimsRule.platforms.includes("nda"));
});

test("PLATFORM_FIELD_SHAPES declares the workstream-specific field shape for every legal workstream", () => {
  assert.deepEqual(PLATFORM_FIELD_SHAPES.nda.default_required, ["title", "bullets", "description"]);
  assert.deepEqual(PLATFORM_FIELD_SHAPES.msa.default_required, ["title", "description"]);
  assert.deepEqual(PLATFORM_FIELD_SHAPES.dpa.default_required, ["title", "selling_points"]);
  assert.deepEqual(PLATFORM_FIELD_SHAPES.sow.default_required, ["title", "description"]);
});

test("slugify keeps CJK characters and collapses everything else to hyphens", () => {
  assert.equal(slugify("Zenith SaaS MSA"), "zenith-saas-msa");
  assert.equal(slugify("双向 NDA"), "双向-nda");
});

// issueExecution is adapted (not a byte-for-byte port) from the retired
// scripts/execute_decisions.ts — see contracts-model.js's doc comment.
test("issueExecution maps approve -> export_issue_list and request_changes -> request_revision", () => {
  const issue = { issue_id: "d-1", platform: "nda", locale: "US" };
  const dryRun = issueExecution(issue, { action: "approve" }, "Acme NDA", { apply: false });
  assert.equal(dryRun.operation, "export_issue_list");
  assert.equal(dryRun.status, "planned");
  assert.match(dryRun.target, /^exports\/acme-nda-nda-us\.md$/);

  const applied = issueExecution(issue, { action: "approve" }, "Acme NDA", { apply: true });
  assert.equal(applied.status, "ready_for_agent");
  assert.match(applied.detail, /export_issues\.mjs/);

  const revision = issueExecution(issue, { action: "request_changes" }, "Acme NDA", { apply: false });
  assert.equal(revision.operation, "request_revision");
  assert.equal(revision.target, "d-1");

  assert.equal(issueExecution(issue, { action: "block" }, "Acme NDA", { apply: false }), null);
});
