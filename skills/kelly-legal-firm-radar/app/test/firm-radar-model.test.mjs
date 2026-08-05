import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  assembleSnapshot,
  buildConfigSummary,
  buildSnapshot,
  deriveActivityLog,
  emptyMetrics,
  itemExecution,
  normalizeCheckRow,
  normalizeEntityRow,
  normalizeItemRow,
  parseJsonValue,
  recomputeMetrics,
  slugify,
  statusFromDecision,
} from "../app/js/firm-radar-model.js";

test("statusFromDecision maps every decision action, ported from lib/common.ts", () => {
  assert.equal(statusFromDecision("approve"), "approved");
  assert.equal(statusFromDecision("request_changes"), "changes_requested");
  assert.equal(statusFromDecision("block"), "blocked");
  // "revise" maps back to needs_review (the retired app's actual behavior,
  // confirmed against lib/data-provider/local-file-provider.ts's
  // ALLOWED_ACTIONS and app/app.js's effectiveItem() statusByAction table),
  // not "unchanged".
  assert.equal(statusFromDecision("revise"), "needs_review");
  assert.equal(statusFromDecision("unknown"), null);
  assert.deepEqual([...DECISION_ACTIONS], ["approve", "request_changes", "revise", "block"]);
});

test("parseJsonValue parses JSON text and falls back on invalid/empty input", () => {
  assert.deepEqual(parseJsonValue('["a","b"]', []), ["a", "b"]);
  assert.deepEqual(parseJsonValue("", []), []);
  assert.deepEqual(parseJsonValue("not json", []), []);
  assert.deepEqual(parseJsonValue(undefined, {}), {});
});

test("normalizeItemRow maps a raw Busabase row (item-id -> item_id) into the review-item shape with fields{} nested", () => {
  const item = normalizeItemRow({
    item_id: "insight-real-estate-growth",
    ref: "Insight #1",
    title: "商业租赁争议增长与团队配置建议",
    status: "needs_review",
    risk: JSON.stringify(["management", "privacy"]),
    evidence: JSON.stringify(["18 个脱敏案例"]),
    sample_size: "18",
    period: "last_12_months",
    visibility: "internal_management",
    lawyer_count: "4",
    public_citable: "1",
    quality_indicators: JSON.stringify(["深圳基层法院样本集中"]),
    decision_note: "复核胜率表达",
  });
  assert.equal(item.id, "insight-real-estate-growth");
  assert.deepEqual(item.risk, ["management", "privacy"]);
  assert.deepEqual(item.evidence, ["18 个脱敏案例"]);
  assert.equal(item.fields.sample_size, 18);
  assert.equal(item.fields.period, "last_12_months");
  assert.equal(item.fields.visibility, "internal_management");
  assert.equal(item.fields.lawyer_count, 4);
  assert.equal(item.fields.public_citable, 1);
  assert.deepEqual(item.fields.quality_indicators, ["深圳基层法院样本集中"]);
  assert.equal(item.review_note, "复核胜率表达");
});

test("normalizeEntityRow / normalizeCheckRow parse JSON-encoded arrays/objects off raw rows", () => {
  const entity = normalizeEntityRow({
    entity_id: "profile-real-estate",
    title: "房地产与租赁争议",
    tags: JSON.stringify(["业务布局", "增长领域"]),
    metrics: JSON.stringify({ case_count: 42, lawyer_count: 5 }),
  });
  assert.equal(entity.id, "profile-real-estate");
  assert.deepEqual(entity.tags, ["业务布局", "增长领域"]);
  assert.deepEqual(entity.metrics, { case_count: 42, lawyer_count: 5 });

  const check = normalizeCheckRow({
    check_id: "chk-sample",
    label: "Sample size",
    status: "warn",
    item_id: "insight-company-brand",
  });
  assert.equal(check.id, "chk-sample");
  assert.equal(check.item_id, "insight-company-brand");
});

test("buildConfigSummary parses JSON-encoded arrays off a raw Settings row and sanitizes counts", () => {
  const summary = buildConfigSummary({
    settings: {
      firm_name: "泰和泰（深圳）律师事务所",
      default_jurisdictions: JSON.stringify(["Guangdong", "Shenzhen"]),
      require_anonymized_metadata: "true",
      minimum_sample_size_for_claim: "5",
      external_brand_claims_require_approval: "true",
      allowed_views: JSON.stringify(["management", "practice"]),
      practice_areas: JSON.stringify(["民商事", "公司争议"]),
    },
  });
  assert.equal(summary.firm_profile.firm_name, "泰和泰（深圳）律师事务所");
  assert.deepEqual(summary.firm_profile.default_jurisdictions, ["Guangdong", "Shenzhen"]);
  assert.equal(summary.analytics_policy.require_anonymized_metadata, true);
  assert.equal(summary.analytics_policy.minimum_sample_size_for_claim, 5);
  assert.equal(summary.analytics_policy.external_brand_claims_require_approval, true);
  assert.deepEqual(summary.analytics_policy.allowed_views, ["management", "practice"]);
  assert.deepEqual(summary.taxonomy.practice_areas, ["民商事", "公司争议"]);
});

test("emptyMetrics / recomputeMetrics count items by status and checks_failed, ported from lib/common.ts", () => {
  assert.deepEqual(emptyMetrics(), {
    items_total: 0,
    needs_review: 0,
    changes_requested: 0,
    approved: 0,
    done: 0,
    blocked: 0,
    checks_failed: 0,
  });
  const items = [{ status: "needs_review" }, { status: "approved" }, { status: "approved" }, { status: "blocked" }];
  const checks = [{ status: "pass" }, { status: "fail" }, { status: "warn" }];
  const metrics = recomputeMetrics(items, checks);
  assert.equal(metrics.items_total, 4);
  assert.equal(metrics.needs_review, 1);
  assert.equal(metrics.approved, 2);
  assert.equal(metrics.blocked, 1);
  assert.equal(metrics.checks_failed, 1);
});

test("recomputeMetrics preserves extra metric keys (e.g. demo's case_samples/outcome_trends) via the extra spread", () => {
  const metrics = recomputeMetrics([], [], {
    case_samples: 73,
    practice_groups: 4,
    outcome_trends: [{ period: "2026 Q2", win_rate: 0.71 }],
  });
  assert.equal(metrics.case_samples, 73);
  assert.equal(metrics.practice_groups, 4);
  assert.deepEqual(metrics.outcome_trends, [{ period: "2026 Q2", win_rate: 0.71 }]);
  assert.equal(metrics.items_total, 0);
});

test("deriveActivityLog derives prepare/update/decision entries from an item's own timestamps, newest first", () => {
  const items = [
    { id: "a", title: "A", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
    {
      id: "b",
      title: "B",
      created_at: "2026-01-02T00:00:00.000Z",
      updated_at: "2026-01-03T00:00:00.000Z",
      decided_at: "2026-01-04T00:00:00.000Z",
      decision_action: "approve",
      review_note: "looks good",
    },
  ];
  const log = deriveActivityLog(items);
  assert.equal(log[0].action, "decision");
  assert.match(log[0].detail, /Approved "B": looks good/);
  assert.ok(log.some((entry) => entry.action === "prepare" && entry.detail.includes("A")));
  assert.ok(log.some((entry) => entry.action === "update" && entry.detail.includes("B")));
});

test("assembleSnapshot computes metrics and activity_log from items/checks", () => {
  const snapshot = assembleSnapshot({
    items: [{ id: "a", title: "A", status: "needs_review", created_at: "2026-01-01T00:00:00.000Z" }],
    entities: [{ id: "e", title: "E" }],
    checks: [{ id: "c", status: "fail" }],
    workspace: { title: "Legal Firm Radar" },
  });
  assert.equal(snapshot.metrics.items_total, 1);
  assert.equal(snapshot.metrics.needs_review, 1);
  assert.equal(snapshot.metrics.checks_failed, 1);
  assert.equal(snapshot.entities.length, 1);
  assert.equal(snapshot.workspace.title, "Legal Firm Radar");
});

test("buildSnapshot (Busabase-row wrapper) normalizes rows then assembles the same shape as assembleSnapshot", () => {
  const snapshot = buildSnapshot({
    items: [{ item_id: "a", ref: "Insight #1", title: "A", status: "needs_review" }],
    entities: [{ entity_id: "e", title: "E" }],
    checks: [{ check_id: "c", status: "pass" }],
    workspace: { title: "Legal Firm Radar" },
  });
  assert.equal(snapshot.items[0].id, "a");
  assert.equal(snapshot.entities[0].id, "e");
  assert.equal(snapshot.metrics.items_total, 1);
});

test("slugify keeps CJK characters and collapses everything else to hyphens", () => {
  assert.equal(slugify("Zenith Legal Ops"), "zenith-legal-ops");
  assert.equal(slugify("商业租赁争议增长与团队配置建议"), "商业租赁争议增长与团队配置建议");
});

// itemExecution is adapted (not a byte-for-byte port) from the retired
// scripts/execute_decisions.ts — see firm-radar-model.js's doc comment: this
// Busabase-only shape never flips status itself, unlike the retired script.
test("itemExecution maps approve -> export_management_report and request_changes -> request_revision, never touches status", () => {
  const item = { id: "insight-real-estate-growth", title: "商业租赁争议增长与团队配置建议" };
  const dryRun = itemExecution(item, "approve", { apply: false });
  assert.equal(dryRun.operation, "export_management_report");
  assert.equal(dryRun.status, "planned");
  assert.match(dryRun.target, /^exports\/management-reports\/商业租赁争议增长与团队配置建议\.md$/);

  const applied = itemExecution(item, "approve", { apply: true });
  assert.equal(applied.status, "ready_for_agent");
  assert.match(applied.detail, /export_management_report\.mjs/);

  const revision = itemExecution(item, "request_changes", { apply: false });
  assert.equal(revision.operation, "request_revision");
  assert.equal(revision.target, "insight-real-estate-growth");

  assert.equal(itemExecution(item, "block", { apply: false }), null);
  assert.equal(itemExecution(item, "revise", { apply: false }), null);
});
