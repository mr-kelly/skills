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
} from "../app/js/precedent-model.js";

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
    item_id: "pack-lease-break",
    ref: "Pack #1",
    title: "商业租赁欠租解除类案包",
    status: "needs_review",
    risk: JSON.stringify(["legal", "confidentiality"]),
    evidence: JSON.stringify(["case-lease-arrears-shenzhen similarity 0.86"]),
    query: "疫情影响下商业租赁欠租能否解除",
    jurisdiction: "深圳",
    match_count: "4",
    high_match_count: "3",
    top_similarity: "0.86",
    avg_similarity: "0.81",
    court_pattern: "深圳法院更重视催告、欠租持续性、减免协商记录与损失证明。",
    citation_count: "9",
    decision_note: "补充最新裁判文书",
  });
  assert.equal(item.id, "pack-lease-break");
  assert.deepEqual(item.risk, ["legal", "confidentiality"]);
  assert.deepEqual(item.evidence, ["case-lease-arrears-shenzhen similarity 0.86"]);
  assert.equal(item.fields.query, "疫情影响下商业租赁欠租能否解除");
  assert.equal(item.fields.jurisdiction, "深圳");
  assert.equal(item.fields.match_count, 4);
  assert.equal(item.fields.high_match_count, 3);
  assert.equal(item.fields.top_similarity, 0.86);
  assert.equal(item.fields.avg_similarity, 0.81);
  assert.equal(item.fields.court_pattern, "深圳法院更重视催告、欠租持续性、减免协商记录与损失证明。");
  assert.equal(item.fields.citation_count, 9);
  assert.equal(item.review_note, "补充最新裁判文书");
});

test("normalizeEntityRow / normalizeCheckRow parse JSON-encoded arrays/objects off raw rows", () => {
  const entity = normalizeEntityRow({
    entity_id: "prec-lease-break",
    title: "疫情期间商业租赁解除与违约金调减",
    tags: JSON.stringify(["租赁", "违约金"]),
    metrics: JSON.stringify({ case_count: 4, avg_similarity: 0.81 }),
  });
  assert.equal(entity.id, "prec-lease-break");
  assert.deepEqual(entity.tags, ["租赁", "违约金"]);
  assert.deepEqual(entity.metrics, { case_count: 4, avg_similarity: 0.81 });

  const check = normalizeCheckRow({
    check_id: "chk-citations",
    label: "Citation coverage",
    status: "pass",
    item_id: "pack-lease-break",
  });
  assert.equal(check.id, "chk-citations");
  assert.equal(check.item_id, "pack-lease-break");
});

test("buildConfigSummary parses JSON-encoded arrays off a raw Settings row and sanitizes booleans", () => {
  const summary = buildConfigSummary({
    settings: {
      firm_name: "泰和泰（深圳）律师事务所",
      default_jurisdictions: JSON.stringify(["Guangdong", "Shenzhen"]),
      default_jurisdiction: "Shenzhen",
      minimum_similarity_score: "0.72",
      require_source_case_ids: "true",
      quote_limit_words: "120",
    },
  });
  assert.equal(summary.firm_profile.firm_name, "泰和泰（深圳）律师事务所");
  assert.deepEqual(summary.firm_profile.default_jurisdictions, ["Guangdong", "Shenzhen"]);
  assert.equal(summary.search_policy.default_jurisdiction, "Shenzhen");
  assert.equal(summary.search_policy.minimum_similarity_score, 0.72);
  assert.equal(summary.search_policy.require_source_case_ids, true);
  assert.equal(summary.search_policy.quote_limit_words, 120);
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

test("recomputeMetrics preserves extra metric keys (e.g. demo's query_count/high_matches/local_patterns) via the extra spread", () => {
  const metrics = recomputeMetrics([], [], {
    query_count: 2,
    high_matches: 7,
    local_patterns: 3,
  });
  assert.equal(metrics.query_count, 2);
  assert.equal(metrics.high_matches, 7);
  assert.equal(metrics.local_patterns, 3);
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
    workspace: { title: "Legal Precedent Desk" },
  });
  assert.equal(snapshot.metrics.items_total, 1);
  assert.equal(snapshot.metrics.needs_review, 1);
  assert.equal(snapshot.metrics.checks_failed, 1);
  assert.equal(snapshot.entities.length, 1);
  assert.equal(snapshot.workspace.title, "Legal Precedent Desk");
});

test("buildSnapshot (Busabase-row wrapper) normalizes rows then assembles the same shape as assembleSnapshot", () => {
  const snapshot = buildSnapshot({
    items: [{ item_id: "a", ref: "Pack #1", title: "A", status: "needs_review" }],
    entities: [{ entity_id: "e", title: "E" }],
    checks: [{ check_id: "c", status: "pass" }],
    workspace: { title: "Legal Precedent Desk" },
  });
  assert.equal(snapshot.items[0].id, "a");
  assert.equal(snapshot.entities[0].id, "e");
  assert.equal(snapshot.metrics.items_total, 1);
});

test("slugify keeps CJK characters and collapses everything else to hyphens", () => {
  assert.equal(slugify("Zenith Legal Research"), "zenith-legal-research");
  assert.equal(slugify("商业租赁欠租解除类案包"), "商业租赁欠租解除类案包");
});

// itemExecution is adapted (not a byte-for-byte port) from the retired
// scripts/execute_decisions.ts — see precedent-model.js's doc comment:
// this Busabase-only shape never flips status itself, unlike the retired
// script (which set item.status = nextStatus directly on --apply).
test("itemExecution maps approve -> export_research_pack and request_changes -> request_revision, never touches status", () => {
  const item = { id: "pack-lease-break", title: "商业租赁欠租解除类案包" };
  const dryRun = itemExecution(item, "approve", { apply: false });
  assert.equal(dryRun.operation, "export_research_pack");
  assert.equal(dryRun.status, "planned");
  assert.match(dryRun.target, /^exports\/research-packs\/商业租赁欠租解除类案包\.md$/);

  const applied = itemExecution(item, "approve", { apply: true });
  assert.equal(applied.status, "ready_for_agent");
  assert.match(applied.detail, /export_research_pack\.mjs/);

  const revision = itemExecution(item, "request_changes", { apply: false });
  assert.equal(revision.operation, "request_revision");
  assert.equal(revision.target, "pack-lease-break");

  assert.equal(itemExecution(item, "block", { apply: false }), null);
  assert.equal(itemExecution(item, "revise", { apply: false }), null);
});
