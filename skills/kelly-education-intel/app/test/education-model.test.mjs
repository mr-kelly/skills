import assert from "node:assert/strict";
import test from "node:test";
import {
  baseActionFields,
  baseDraftFields,
  baseSignalFields,
  batchMetaPayload,
  buildSnapshot,
  computeMetrics,
  normalizeAction,
  normalizeDraft,
  normalizeSignal,
  normalizeSource,
  operationForDecision,
  parseBatchMeta,
  statusForAction,
} from "../app/js/education-model.js";

test("statusForAction: worked-example verb -> status mapping (ported verbatim from the retired app/app.js's effectiveStatus())", () => {
  assert.equal(statusForAction("approve"), "approved");
  assert.equal(statusForAction("block"), "blocked");
  assert.equal(statusForAction("request_changes"), "changes_requested");
  assert.equal(statusForAction("revise"), "needs_review");
  assert.equal(statusForAction(""), "needs_review");
  assert.equal(statusForAction("unknown"), "needs_review");
});

test("baseSignalFields/normalizeSignal round trip preserves every field", () => {
  const signal = {
    id: "signal-1",
    kind: "signal",
    ref: 1,
    title: "Exam or admissions dates create a narrow follow-up window",
    summary: "summary text",
    why_it_matters: "why text",
    buyer_intent: "High: creates a concrete sales or follow-up trigger.",
    confidence: 0.82,
    detected_at: "2026-08-01T00:00:00.000Z",
    status: "needs_review",
    risk: ["claims-review"],
    source: { name: "Official/news source", url: "https://example.com/source-1" },
    suggested_action_id: "action-1",
  };
  const fields = baseSignalFields({ signal_id: signal.id, ...signal });
  const roundTripped = normalizeSignal({
    signal_id: fields.signal_id,
    ref: fields.ref,
    title: fields.title,
    summary: fields.summary,
    why_it_matters: fields.why_it_matters,
    buyer_intent: fields.buyer_intent,
    confidence: fields.confidence,
    detected_at: fields.detected_at,
    status: fields.status,
    risk: fields.risk,
    source_name: fields.source_name,
    source_url: fields.source_url,
    suggested_action_id: fields.suggested_action_id,
  });
  assert.equal(roundTripped.id, signal.id);
  assert.equal(roundTripped.title, signal.title);
  assert.equal(roundTripped.confidence, signal.confidence);
  assert.deepEqual(roundTripped.risk, signal.risk);
  assert.deepEqual(roundTripped.source, signal.source);
});

test("baseActionFields/normalizeAction round trip preserves linked_signal_ids array", () => {
  const fields = baseActionFields({
    action_id: "action-1",
    ref: 1,
    title: "Draft a parent FAQ with source-backed answers",
    summary: "summary",
    status: "needs_review",
    priority: "high",
    owner: "operator",
    reason: "Linked to today's reviewed signal set.",
    linked_signal_ids: ["signal-1"],
    next_step: "Review the evidence, approve the action, then export it.",
  });
  const action = normalizeAction({
    action_id: fields.action_id,
    ref: fields.ref,
    title: fields.title,
    summary: fields.summary,
    status: fields.status,
    priority: fields.priority,
    owner: fields.owner,
    reason: fields.reason,
    linked_signal_ids: fields.linked_signal_ids,
    next_step: fields.next_step,
  });
  assert.equal(action.kind, "action");
  assert.deepEqual(action.linked_signal_ids, ["signal-1"]);
});

test("baseDraftFields/normalizeDraft: effective_body prefers edited_body over body", () => {
  const fields = baseDraftFields({
    draft_id: "draft-1",
    ref: 1,
    channel: "parent WhatsApp",
    title: "parent WhatsApp: today's approved angle",
    body: "original draft body",
    edited_body: "",
    status: "needs_review",
    risk: [],
    linked_action_id: "action-1",
  });
  const draftNoEdit = normalizeDraft({ ...fields });
  assert.equal(draftNoEdit.effective_body, "original draft body");

  const draftEdited = normalizeDraft({ ...fields, edited_body: "human-revised body" });
  assert.equal(draftEdited.effective_body, "human-revised body");
});

test("normalizeSource: defaults status to needs_config when absent", () => {
  const source = normalizeSource({ source_id: "trends", label: "Trend keywords" });
  assert.equal(source.status, "needs_config");
});

test("parseBatchMeta/batchMetaPayload round trip", () => {
  const meta = {
    schema_version: "1",
    batch_id: "kelly-education-intel-20260806",
    generated_at: "2026-08-06T09:00:00.000Z",
    source: "kelly-education-intel",
    vertical: "education, training, tutoring, and admissions services",
    buyer: "education center owners and admissions consultants",
    offer: "daily education intelligence that becomes parent FAQs",
  };
  const payload = batchMetaPayload(meta);
  assert.deepEqual(parseBatchMeta(payload), meta);
  assert.deepEqual(parseBatchMeta(""), {
    schema_version: "1",
    batch_id: "",
    generated_at: "",
    source: "kelly-education-intel",
    vertical: "education, training, tutoring, and admissions services",
    buyer: "",
    offer: "",
  });
});

test("computeMetrics: worked example across signals/actions/drafts (blocked folds in changes_requested)", () => {
  const signals = [{ status: "needs_review" }, { status: "approved" }];
  const actions = [{ status: "needs_review" }, { status: "blocked" }];
  const drafts = [{ status: "changes_requested" }, { status: "approved" }];
  const metrics = computeMetrics({ signals, actions, drafts });
  assert.equal(metrics.signals_needs_review, 1);
  assert.equal(metrics.actions_needs_review, 1);
  assert.equal(metrics.drafts_needs_review, 0);
  assert.equal(metrics.needs_review, 2);
  assert.equal(metrics.approved, 2);
  // 1 blocked action + 1 changes_requested draft = 2
  assert.equal(metrics.blocked, 2);
});

test("buildSnapshot: assembles normalized batch and rollup metrics together", () => {
  const batch = buildSnapshot({
    signals: [{ signal_id: "signal-1", ref: 1, title: "s1", status: "needs_review" }],
    actions: [{ action_id: "action-1", ref: 1, title: "a1", status: "approved" }],
    drafts: [{ draft_id: "draft-1", ref: 1, channel: "parent WhatsApp", status: "blocked" }],
    sources: [{ source_id: "news", label: "News" }],
    meta: { batch_id: "b1", buyer: "education center owners" },
  });
  assert.equal(batch.batch_id, "b1");
  assert.equal(batch.signals.length, 1);
  assert.equal(batch.actions.length, 1);
  assert.equal(batch.drafts.length, 1);
  assert.equal(batch.sources.length, 1);
  assert.equal(batch.metrics.needs_review, 1);
  assert.equal(batch.metrics.approved, 1);
  assert.equal(batch.metrics.blocked, 1);
});

test("operationForDecision: approve on a draft (has channel) -> handoff_content_pack, target is the channel", () => {
  const draft = { channel: "parent WhatsApp", title: "parent WhatsApp: today's angle", next_step: undefined };
  assert.deepEqual(operationForDecision(draft, "approve"), {
    operation: "handoff_content_pack",
    target: "parent WhatsApp",
  });
});

test("operationForDecision: approve on an action (has next_step, no channel) -> export_action_plan, target is the title", () => {
  const action = { title: "Draft a parent FAQ with source-backed answers", next_step: "Review and approve." };
  assert.deepEqual(operationForDecision(action, "approve"), {
    operation: "export_action_plan",
    target: "Draft a parent FAQ with source-backed answers",
  });
});

test("operationForDecision: approve on a plain signal (no channel, no next_step) -> mark_signal_approved", () => {
  const signal = { title: "Exam or admissions dates create a narrow follow-up window" };
  assert.deepEqual(operationForDecision(signal, "approve"), {
    operation: "mark_signal_approved",
    target: "Exam or admissions dates create a narrow follow-up window",
  });
});

test("operationForDecision: request_changes/block/revise map to their fixed operation names", () => {
  const item = { title: "Draft memo" };
  assert.equal(operationForDecision(item, "request_changes").operation, "queue_agent_revision");
  assert.equal(operationForDecision(item, "block").operation, "mark_blocked");
  assert.equal(operationForDecision(item, "revise").operation, "save_human_revision");
  assert.equal(operationForDecision(item, "unknown"), null);
});
