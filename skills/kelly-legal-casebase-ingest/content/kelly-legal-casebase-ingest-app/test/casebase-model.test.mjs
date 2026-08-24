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
} from "../app/js/casebase-model.js";

test("statusFromDecision maps every decision action, ported from lib/common.ts", () => {
  assert.equal(statusFromDecision("approve"), "approved");
  assert.equal(statusFromDecision("request_changes"), "changes_requested");
  assert.equal(statusFromDecision("block"), "blocked");
  // Unlike kelly-legal-contracts' statusForVerdict, "revise" here maps back
  // to needs_review (the retired app's actual behavior), not "unchanged".
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
    item_id: "ingest-lease-arrears",
    ref: "Intake #1",
    title: "深圳商业租赁欠租解除案",
    status: "needs_review",
    risk: JSON.stringify(["privacy", "business_secret"]),
    evidence: JSON.stringify(["已替换当事人姓名"]),
    cause: "租赁合同纠纷",
    court: "深圳市中级人民法院",
    paragraphs: JSON.stringify(["事实 3", "本院认为 2"]),
    extraction_confidence: "0.91",
    duplicate_score: "0.22",
    pii_cleared: "true",
    parties_redacted: "true",
    contacts_redacted: "false",
    decision_note: "复核租户经营数据",
  });
  assert.equal(item.id, "ingest-lease-arrears");
  assert.deepEqual(item.risk, ["privacy", "business_secret"]);
  assert.deepEqual(item.evidence, ["已替换当事人姓名"]);
  assert.equal(item.fields.cause, "租赁合同纠纷");
  assert.deepEqual(item.fields.paragraphs, ["事实 3", "本院认为 2"]);
  assert.equal(item.fields.extraction_confidence, 0.91);
  assert.equal(item.fields.duplicate_score, 0.22);
  assert.equal(item.fields.pii_cleared, true);
  assert.equal(item.fields.contacts_redacted, false);
  assert.equal(item.review_note, "复核租户经营数据");
});

test("normalizeEntityRow / normalizeCheckRow parse JSON-encoded arrays/objects off raw rows", () => {
  const entity = normalizeEntityRow({
    entity_id: "case-lease-arrears-shenzhen",
    title: "深圳商业租赁欠租解除案",
    tags: JSON.stringify(["租赁合同", "违约金调减"]),
    metrics: JSON.stringify({ case_count: 18, pii_flags: 1 }),
  });
  assert.equal(entity.id, "case-lease-arrears-shenzhen");
  assert.deepEqual(entity.tags, ["租赁合同", "违约金调减"]);
  assert.deepEqual(entity.metrics, { case_count: 18, pii_flags: 1 });

  const check = normalizeCheckRow({
    check_id: "chk-pii",
    label: "PII redaction",
    status: "warn",
    item_id: "ingest-lease-arrears",
  });
  assert.equal(check.id, "chk-pii");
  assert.equal(check.item_id, "ingest-lease-arrears");
});

test("buildConfigSummary parses JSON-encoded arrays off a raw Settings row and sanitizes counts", () => {
  const summary = buildConfigSummary({
    settings: {
      firm_name: "泰和泰（深圳）律师事务所",
      default_jurisdictions: JSON.stringify(["Guangdong", "Shenzhen"]),
      allowed_document_types: JSON.stringify(["judgment", "arbitral_award"]),
      require_party_redaction: "true",
      sample_rate: "0.2",
      required_taxonomy_fields: JSON.stringify(["cause", "court"]),
    },
  });
  assert.equal(summary.firm_profile.firm_name, "泰和泰（深圳）律师事务所");
  assert.deepEqual(summary.firm_profile.default_jurisdictions, ["Guangdong", "Shenzhen"]);
  assert.deepEqual(summary.ingestion.allowed_document_types, ["judgment", "arbitral_award"]);
  assert.equal(summary.anonymization.require_party_redaction, true);
  assert.equal(summary.anonymization.sample_rate, 0.2);
  assert.deepEqual(summary.taxonomy.required_fields, ["cause", "court"]);
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

test("recomputeMetrics preserves extra metric keys (e.g. demo's source_docs/pii_warnings) via the extra spread", () => {
  const metrics = recomputeMetrics([], [], { source_docs: 8, pii_warnings: 1, duplicate_candidates: 1 });
  assert.equal(metrics.source_docs, 8);
  assert.equal(metrics.items_total, 0);
});

test("deriveActivityLog derives ingest/update/decision entries from an item's own timestamps, newest first", () => {
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
  assert.ok(log.some((entry) => entry.action === "ingest" && entry.detail.includes("A")));
  assert.ok(log.some((entry) => entry.action === "update" && entry.detail.includes("B")));
});

test("assembleSnapshot computes metrics and activity_log from items/checks", () => {
  const snapshot = assembleSnapshot({
    items: [{ id: "a", title: "A", status: "needs_review", created_at: "2026-01-01T00:00:00.000Z" }],
    entities: [{ id: "e", title: "E" }],
    checks: [{ id: "c", status: "fail" }],
    workspace: { title: "Legal Casebase Ingest" },
  });
  assert.equal(snapshot.metrics.items_total, 1);
  assert.equal(snapshot.metrics.needs_review, 1);
  assert.equal(snapshot.metrics.checks_failed, 1);
  assert.equal(snapshot.entities.length, 1);
  assert.equal(snapshot.workspace.title, "Legal Casebase Ingest");
});

test("buildSnapshot (Busabase-row wrapper) normalizes rows then assembles the same shape as assembleSnapshot", () => {
  const snapshot = buildSnapshot({
    items: [{ item_id: "a", ref: "Intake #1", title: "A", status: "needs_review" }],
    entities: [{ entity_id: "e", title: "E" }],
    checks: [{ check_id: "c", status: "pass" }],
    workspace: { title: "Legal Casebase Ingest" },
  });
  assert.equal(snapshot.items[0].id, "a");
  assert.equal(snapshot.entities[0].id, "e");
  assert.equal(snapshot.metrics.items_total, 1);
});

test("slugify keeps CJK characters and collapses everything else to hyphens", () => {
  assert.equal(slugify("Zenith Legal Ops"), "zenith-legal-ops");
  assert.equal(slugify("深圳商业租赁欠租解除案"), "深圳商业租赁欠租解除案");
});

// itemExecution is adapted (not a byte-for-byte port) from the retired
// scripts/execute_decisions.ts — see casebase-model.js's doc comment: this
// Busabase-only shape never flips status itself, unlike the retired script.
test("itemExecution maps approve -> export_case_record and request_changes -> request_revision, never touches status", () => {
  const item = { id: "ingest-lease-arrears", title: "深圳商业租赁欠租解除案" };
  const dryRun = itemExecution(item, "approve", { apply: false });
  assert.equal(dryRun.operation, "export_case_record");
  assert.equal(dryRun.status, "planned");
  assert.match(dryRun.target, /^exports\/case-records\/深圳商业租赁欠租解除案\.md$/);

  const applied = itemExecution(item, "approve", { apply: true });
  assert.equal(applied.status, "ready_for_agent");
  assert.match(applied.detail, /export_case_records\.mjs/);

  const revision = itemExecution(item, "request_changes", { apply: false });
  assert.equal(revision.operation, "request_revision");
  assert.equal(revision.target, "ingest-lease-arrears");

  assert.equal(itemExecution(item, "block", { apply: false }), null);
  assert.equal(itemExecution(item, "revise", { apply: false }), null);
});
