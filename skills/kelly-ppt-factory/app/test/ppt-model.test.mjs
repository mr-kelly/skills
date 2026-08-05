import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  baseDeckFields,
  baseSlideFields,
  buildConfigSummary,
  buildSnapshot,
  defaultStyleSystem,
  deriveActivityLog,
  deriveReviewItems,
  deriveWarnings,
  itemExecution,
  normalizeDeckRow,
  normalizeProjectRow,
  normalizeSlideRow,
  parseJsonValue,
  recomputeMetrics,
  statusFromDecision,
} from "../app/js/ppt-model.js";

test("statusFromDecision maps every allowed action, ported from the retired effectiveStatus() table", () => {
  assert.equal(statusFromDecision("approve"), "approved");
  assert.equal(statusFromDecision("request_changes"), "changes_requested");
  assert.equal(statusFromDecision("block"), "blocked");
  assert.equal(statusFromDecision("revise"), "needs_review");
  assert.equal(statusFromDecision("unknown"), null);
  assert.deepEqual([...DECISION_ACTIONS].sort(), ["approve", "block", "request_changes", "revise"]);
});

test("normalizeProjectRow/parseJsonValue survive missing fields with defaults", () => {
  const project = normalizeProjectRow({ project_id: "proj-1", status: "" });
  assert.equal(project.project_id, "proj-1");
  assert.equal(project.status, "needs_review");
  assert.equal(project.deck_count, 0);
  assert.equal(parseJsonValue("not json", []).length, 0);
  assert.deepEqual(parseJsonValue('["a","b"]', []), ["a", "b"]);
});

test("normalizeDeckRow/baseDeckFields round-trip through Busabase field-slug shapes", () => {
  const row = {
    deck_id: "deck-1",
    ref: "1",
    project_id: "proj-1",
    title: "Seed Pitch",
    theme: "investor story",
    level: "strategic",
    audience: "Founders",
    status: "approved",
    target_slide_count: 12,
    approved_slide_count: 12,
    generated_slide_count: 0,
    style_score: 88,
    pptx_path: "exports/seed.pptx",
    render_path: "exports/rendered/deck-1",
    updated_at: "2026-07-06T12:00:00.000Z",
    review_summary: "Ready for generation.",
    review_suggestions: JSON.stringify(["Tighten the close"]),
    review_draft_note: "Generate PPTX.",
    decision_action: "approve",
    decision_note: "Looks good.",
    decided_at: "2026-07-06T12:00:00.000Z",
  };
  const deck = normalizeDeckRow(row);
  assert.equal(deck.deck_id, "deck-1");
  assert.equal(deck.status, "approved");
  assert.deepEqual(deck.review_suggestions, ["Tighten the close"]);
  assert.equal(deck.decision_action, "approve");

  const fields = baseDeckFields(deck);
  assert.equal(fields.deck_id, "deck-1");
  assert.equal(fields.review_suggestions, row.review_suggestions);
  assert.equal(fields.decision_action, "approve");
});

test("normalizeSlideRow/baseSlideFields round-trip content and JSON array fields", () => {
  const row = {
    slide_id: "slide-1",
    ref: "2",
    deck_id: "deck-1",
    project_id: "proj-1",
    status: "needs_review",
    slide_type: "concept",
    layout: "headline left",
    title: "Why Now",
    objective: "Explain timing.",
    content_subtitle: "",
    content_chinese: "AI 工作正在从试验走向日常运营节奏。",
    content_pinyin: "",
    content_english: "Add 3 proof points.",
    content_bullets: JSON.stringify(["usage", "budget"]),
    content_teacher_notes: "",
    content_interaction: "Review two headline options.",
    content_image_prompt: "Three market signal cards.",
    asset_brief: "Three market signal cards.",
    style_checks: JSON.stringify(["palette", "one message"]),
    qa_flags: JSON.stringify(["Headline still too generic."]),
    updated_at: "2026-07-07T08:00:00.000Z",
    review_summary: "Slide #2 needs a sharper headline.",
    review_suggestions: JSON.stringify(["Name the buyer behavior change"]),
    review_draft_note: "Make the headline more specific.",
    decision_action: "",
    decision_note: "",
  };
  const slide = normalizeSlideRow(row);
  assert.equal(slide.content.chinese, row.content_chinese);
  assert.deepEqual(slide.content.bullets, ["usage", "budget"]);
  assert.deepEqual(slide.style_checks, ["palette", "one message"]);
  assert.deepEqual(slide.qa_flags, ["Headline still too generic."]);

  const fields = baseSlideFields(slide);
  assert.equal(fields.slide_id, "slide-1");
  assert.equal(fields.content_chinese, row.content_chinese);
  assert.equal(fields.content_bullets, row.content_bullets);
  assert.equal(fields.style_checks, row.style_checks);
});

test("recomputeMetrics: worked example over 3 decks / 5 slides / 3 checks", () => {
  const decks = [
    { style_score: 88, status: "needs_review" },
    { style_score: 94, status: "approved" },
    { style_score: 91, status: "generated" },
  ];
  const slideCards = [
    { status: "approved" },
    { status: "needs_review" },
    { status: "changes_requested" },
    { status: "approved" },
    { status: "generated" },
  ];
  const qaChecks = [{ result: "warn" }, { result: "pass" }, { result: "manual" }];
  const metrics = recomputeMetrics([{}, {}, {}], decks, slideCards, qaChecks);
  assert.equal(metrics.project_count, 3);
  assert.equal(metrics.deck_count, 3);
  assert.equal(metrics.slide_count, 5);
  assert.equal(metrics.slides_needs_review, 2); // needs_review + changes_requested
  assert.equal(metrics.slides_approved, 2);
  assert.equal(metrics.decks_generated, 1);
  assert.equal(metrics.qa_warnings, 2); // warn + manual
  // (88 + 94 + 91) / 3 = 91
  assert.equal(metrics.avg_style_score, 91);
});

test("deriveReviewItems only includes rows with a non-empty review_summary", () => {
  const decks = [
    { deck_id: "deck-1", ref: 1, status: "approved", review_summary: "Ready for export.", review_suggestions: [] },
    { deck_id: "deck-2", ref: 2, status: "generated", review_summary: "" },
  ];
  const slideCards = [
    {
      slide_id: "slide-1",
      ref: 1,
      status: "needs_review",
      review_summary: "Needs a sharper headline.",
      review_suggestions: [],
    },
    { slide_id: "slide-2", ref: 2, status: "approved", review_summary: "" },
  ];
  const items = deriveReviewItems(decks, slideCards);
  assert.equal(items.length, 2);
  assert.equal(items[0].target_type, "deck");
  assert.equal(items[0].review_id, "deck:deck-1");
  assert.equal(items[1].target_type, "slide");
  assert.equal(items[1].review_id, "slide:slide-1");
});

test("deriveActivityLog only surfaces rows with both decided_at and decision_action, newest first", () => {
  const decks = [
    {
      deck_id: "deck-1",
      title: "Sales Playbook",
      decision_action: "approve",
      decision_note: "Go",
      decided_at: "2026-07-06T12:00:00.000Z",
    },
    { deck_id: "deck-2", title: "No decision yet", decision_action: "", decided_at: "" },
  ];
  const slideCards = [
    {
      slide_id: "slide-1",
      title: "Pricing Model",
      decision_action: "request_changes",
      decision_note: "Simplify",
      decided_at: "2026-07-06T09:30:00.000Z",
    },
  ];
  const activity = deriveActivityLog(decks, slideCards);
  assert.equal(activity.length, 2);
  assert.equal(activity[0].target_id, "deck-1"); // newest first
  assert.match(activity[0].detail, /Approved deck "Sales Playbook": Go/);
  assert.match(activity[1].detail, /Requested changes on slide "Pricing Model": Simplify/);
});

test("deriveWarnings surfaces only warn/fail QA checks", () => {
  const warnings = deriveWarnings([
    { check_id: "qa-1", result: "warn", target_id: "slide-1", rule: "Headline specificity", evidence: "..." },
    { check_id: "qa-2", result: "pass", target_id: "deck-1", rule: "Style consistency", evidence: "..." },
    { check_id: "qa-3", result: "fail", target_id: "deck-2", rule: "Contrast", evidence: "..." },
  ]);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].severity, "warning");
  assert.equal(warnings[1].severity, "error");
});

test("buildConfigSummary falls back to defaultStyleSystem() when no style rows exist", () => {
  const summary = buildConfigSummary({ settings: { default_brand_id: "client-1", brand_name: "Acme" } });
  assert.equal(summary.default_brand_id, "client-1");
  assert.equal(summary.brand_profiles[0].name, "Acme");
  assert.deepEqual(summary.style_systems, [defaultStyleSystem()]);
  assert.equal(summary.export.out_dir, "exports");
  assert.equal(summary.export.require_render_qa, true);
});

test("buildSnapshot assembles normalized Busabase rows into the full snapshot shape", () => {
  const snapshot = buildSnapshot({
    projects: [{ project_id: "proj-1", title: "Investor Story", status: "needs_review" }],
    decks: [{ deck_id: "deck-1", project_id: "proj-1", title: "Seed Pitch", status: "approved", style_score: 88 }],
    slideCards: [{ slide_id: "slide-1", deck_id: "deck-1", project_id: "proj-1", title: "Cover", status: "approved" }],
    styleSystems: [],
    qaChecks: [{ check_id: "qa-1", result: "pass", target_id: "deck-1", target_type: "deck" }],
    exportsList: [],
    settings: {},
  });
  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.decks.length, 1);
  assert.equal(snapshot.slide_cards.length, 1);
  assert.equal(snapshot.metrics.project_count, 1);
  assert.deepEqual(snapshot.style_systems, [defaultStyleSystem()]);
});

test("itemExecution never flips workflow status, only proposes the follow-up operation", () => {
  const approveDeck = itemExecution({ deck_id: "deck-1" }, "deck", "approve", { apply: false });
  assert.equal(approveDeck.operation, "approve_deck_for_pptx_generation");
  assert.equal(approveDeck.status, "planned");
  assert.match(approveDeck.detail, /generate_pptx\.mjs --deck=deck-1/);

  const approveSlide = itemExecution({ slide_id: "slide-1" }, "slide", "approve", { apply: true });
  assert.equal(approveSlide.operation, "approve_slide_card");
  assert.equal(approveSlide.status, "ready_for_agent");

  const requestChanges = itemExecution({ deck_id: "deck-1" }, "deck", "request_changes", {});
  assert.equal(requestChanges.operation, "queue_agent_revision");

  const blocked = itemExecution({ slide_id: "slide-1" }, "slide", "block", {});
  assert.equal(blocked.operation, "block_generation");

  const revised = itemExecution({ slide_id: "slide-1" }, "slide", "revise", {});
  assert.equal(revised.operation, "save_human_revision");
});
