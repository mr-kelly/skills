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
} from "../app/js/matter-strategy-model.js";

test("statusFromDecision maps every decision action, ported from lib/common.ts", () => {
  assert.equal(statusFromDecision("approve"), "approved");
  assert.equal(statusFromDecision("request_changes"), "changes_requested");
  assert.equal(statusFromDecision("block"), "blocked");
  // "revise" maps back to needs_review (the retired app's actual behavior,
  // confirmed against lib/data-provider/local-file-provider.ts's
  // ALLOWED_ACTIONS and lib/common.ts's statusFromDecision() table), not
  // "unchanged".
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
    item_id: "strategy-saas-arrears",
    ref: "Strategy #1",
    title: "SaaS 服务费欠款诉前策略",
    status: "needs_review",
    risk: JSON.stringify(["legal", "deadline"]),
    evidence: JSON.stringify(["pack-lease-break: 催告程序重要性"]),
    matter_stage: "诉前",
    evidence_gap_count: "2",
    evidence_gaps_list: JSON.stringify(["服务验收节点缺少客户确认", "催告送达凭证需要补强"]),
    issue_tree: JSON.stringify([{ label: "服务是否完成交付", children: ["交付节点是否有客户确认"] }]),
    negotiation_options: JSON.stringify(["先发律师函固定解除权"]),
    posture: "证据补强后再启动正式函件。",
    pleading_outline: "请求解除合同、支付服务费、承担违约金。",
    deadline: "2026-07-20",
    decision_note: "补充催告证据",
  });
  assert.equal(item.id, "strategy-saas-arrears");
  assert.deepEqual(item.risk, ["legal", "deadline"]);
  assert.deepEqual(item.evidence, ["pack-lease-break: 催告程序重要性"]);
  assert.equal(item.fields.matter_stage, "诉前");
  assert.equal(item.fields.evidence_gap_count, 2);
  assert.deepEqual(item.fields.evidence_gaps_list, ["服务验收节点缺少客户确认", "催告送达凭证需要补强"]);
  assert.deepEqual(item.fields.issue_tree, [{ label: "服务是否完成交付", children: ["交付节点是否有客户确认"] }]);
  assert.deepEqual(item.fields.negotiation_options, ["先发律师函固定解除权"]);
  assert.equal(item.fields.posture, "证据补强后再启动正式函件。");
  assert.equal(item.fields.pleading_outline, "请求解除合同、支付服务费、承担违约金。");
  assert.equal(item.fields.deadline, "2026-07-20");
  assert.equal(item.review_note, "补充催告证据");
});

test("normalizeEntityRow / normalizeCheckRow parse JSON-encoded arrays/objects off raw rows", () => {
  const entity = normalizeEntityRow({
    entity_id: "matter-saas-arrears",
    title: "SaaS 服务费欠款与解除争议",
    tags: JSON.stringify(["合同纠纷", "证据补强"]),
    metrics: JSON.stringify({ evidence_gaps: 2, issue_count: 3 }),
  });
  assert.equal(entity.id, "matter-saas-arrears");
  assert.deepEqual(entity.tags, ["合同纠纷", "证据补强"]);
  assert.deepEqual(entity.metrics, { evidence_gaps: 2, issue_count: 3 });

  const check = normalizeCheckRow({
    check_id: "chk-evidence",
    label: "Evidence map",
    status: "warn",
    item_id: "strategy-saas-arrears",
  });
  assert.equal(check.id, "chk-evidence");
  assert.equal(check.item_id, "strategy-saas-arrears");
});

test("buildConfigSummary parses JSON-encoded arrays off a raw Settings row and sanitizes booleans", () => {
  const summary = buildConfigSummary({
    settings: {
      firm_name: "泰和泰（深圳）律师事务所",
      default_jurisdictions: JSON.stringify(["Guangdong", "Shenzhen"]),
      require_precedent_links: "true",
      require_evidence_map: "true",
      default_risk_scale: JSON.stringify(["low", "medium", "high", "critical"]),
      approval_required_for_client_facing: "true",
      templates_enabled: JSON.stringify(["litigation_claim", "defense"]),
    },
  });
  assert.equal(summary.firm_profile.firm_name, "泰和泰（深圳）律师事务所");
  assert.deepEqual(summary.firm_profile.default_jurisdictions, ["Guangdong", "Shenzhen"]);
  assert.equal(summary.strategy_policy.require_precedent_links, true);
  assert.equal(summary.strategy_policy.require_evidence_map, true);
  assert.deepEqual(summary.strategy_policy.default_risk_scale, ["low", "medium", "high", "critical"]);
  assert.equal(summary.strategy_policy.approval_required_for_client_facing, true);
  assert.deepEqual(summary.templates.enabled, ["litigation_claim", "defense"]);
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

test("recomputeMetrics preserves extra metric keys (e.g. demo's evidence_gaps/deadlines_soon/draft_ready) via the extra spread", () => {
  const metrics = recomputeMetrics([], [], {
    evidence_gaps: 2,
    deadlines_soon: 1,
    draft_ready: 1,
  });
  assert.equal(metrics.evidence_gaps, 2);
  assert.equal(metrics.deadlines_soon, 1);
  assert.equal(metrics.draft_ready, 1);
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
    workspace: { title: "Legal Matter Strategy" },
  });
  assert.equal(snapshot.metrics.items_total, 1);
  assert.equal(snapshot.metrics.needs_review, 1);
  assert.equal(snapshot.metrics.checks_failed, 1);
  assert.equal(snapshot.entities.length, 1);
  assert.equal(snapshot.workspace.title, "Legal Matter Strategy");
});

test("buildSnapshot (Busabase-row wrapper) normalizes rows then assembles the same shape as assembleSnapshot", () => {
  const snapshot = buildSnapshot({
    items: [{ item_id: "a", ref: "Strategy #1", title: "A", status: "needs_review" }],
    entities: [{ entity_id: "e", title: "E" }],
    checks: [{ check_id: "c", status: "pass" }],
    workspace: { title: "Legal Matter Strategy" },
  });
  assert.equal(snapshot.items[0].id, "a");
  assert.equal(snapshot.entities[0].id, "e");
  assert.equal(snapshot.metrics.items_total, 1);
});

test("slugify keeps CJK characters and collapses everything else to hyphens", () => {
  assert.equal(slugify("Zenith Legal Ops"), "zenith-legal-ops");
  assert.equal(slugify("SaaS 服务费欠款诉前策略"), "saas-服务费欠款诉前策略");
});

// itemExecution is adapted (not a byte-for-byte port) from the retired
// scripts/execute_decisions.ts — see matter-strategy-model.js's doc comment:
// this Busabase-only shape never flips status itself, unlike the retired
// script (which set item.status = "done" directly on --apply for an
// "approve" decision).
test("itemExecution maps approve -> export_strategy_pack and request_changes -> request_revision, never touches status", () => {
  const item = { id: "strategy-saas-arrears", title: "SaaS 服务费欠款诉前策略" };
  const dryRun = itemExecution(item, "approve", { apply: false });
  assert.equal(dryRun.operation, "export_strategy_pack");
  assert.equal(dryRun.status, "planned");
  assert.match(dryRun.target, /^exports\/strategy-packs\/saas-服务费欠款诉前策略\.md$/);

  const applied = itemExecution(item, "approve", { apply: true });
  assert.equal(applied.status, "ready_for_agent");
  assert.match(applied.detail, /export_strategy_pack\.mjs/);

  const revision = itemExecution(item, "request_changes", { apply: false });
  assert.equal(revision.operation, "request_revision");
  assert.equal(revision.target, "strategy-saas-arrears");

  assert.equal(itemExecution(item, "block", { apply: false }), null);
  assert.equal(itemExecution(item, "revise", { apply: false }), null);
});
