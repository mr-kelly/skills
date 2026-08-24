// Pure domain logic for kelly-ppt-factory, ported verbatim where possible
// (same field names, same order of operations, only TS types stripped) from
// the retired lib/types.ts (WorkflowStatus/Project/Deck/SlideCard/QaCheck/
// ExportRecord/ReviewItem/Metrics shapes), lib/data-provider/local-file-provider.ts
// (defaultStyleSystem/normalizeBrand/normalizeStyle/summarizeConfig/
// applyDecision's allowed-action set), and app/server/demo.ts's metrics
// computation. Identity fields keep their original names (project_id,
// deck_id, slide_id, ...) rather than being renamed to a generic `id`, so
// app.js's rendering logic ports with minimal transcription risk.
//
// Architectural change from the retired local-file shape: a reviewer
// decision on a slide card or deck is no longer a separate decisions.json
// bucket keyed by review_id — the verdict (`decision_action`/
// `decision_note`/`decided_at`) and the resulting workflow `status` are
// written directly onto the slide card's or deck's own Busabase row,
// mirroring kelly-legal-precedent-desk's items Base. A row is "in the review
// queue" when it carries a non-empty `review_summary` (the agent's note on
// what needs a human look) — this replaces the retired separate
// review_items.json array. `agent_tasks.json` (queued "revise_slide_card"/
// "revise_deck_plan" work) is dropped entirely: nothing in the UI ever read
// it, and Busabase reads are always live so there is no staleness gap to
// paper over with a task queue.

export const APP_ID = "kelly-ppt-factory";
export const APP_TITLE = "Kelly PPT Factory";

export function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function boolField(value, fallback = false) {
  if (value === "" || value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

// ---- Decision -> status mapping, adapted from the retired local-file
// provider's DECISION_ACTIONS set + app.js's effectiveStatus() display
// mapping. "revise" now writes status: "needs_review" directly (it used to
// leave item.status untouched and rely on a decisions.json overlay to
// display "needs_review" via effectiveStatus()) since Busabase writes are
// the only source of truth now. ----

export const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

export function statusFromDecision(action) {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  if (action === "revise") return "needs_review";
  return null;
}

// ---- Style system, ported verbatim from local-file-provider.ts's
// defaultStyleSystem()/normalizeStyle() ----

export function defaultStyleSystem() {
  return {
    style_system_id: "style-clean-growth-system",
    name: "Clean Growth System",
    palette: ["#2563EB", "#F8FAFC", "#111827", "#14B8A6", "#F59E0B"],
    fonts: { heading: "Aptos Display", body: "Aptos", chinese: "PingFang SC" },
    visual_rules: [
      "Use one clear headline and one visual proof point per slide.",
      "Prefer product screenshots, clean charts, and inspectable diagrams over decoration.",
      "Use the primary color for navigation and one accent color for emphasis.",
    ],
    layout_rules: [
      "One message per slide.",
      "Use stable slide families: cover, agenda, section, concept, comparison, data chart, case study, summary.",
      "Do not crowd text; split dense content into multiple slides.",
    ],
    component_library: ["title rail", "metric callout", "two-column proof block", "speaker note strip", "review badge"],
  };
}

export function normalizeBrand({
  client_id = "",
  name = "",
  audience = "",
  language_mode = "",
  style_system_id = "",
} = {}) {
  return {
    client_id: client_id || "client-demo-studio",
    name: name || "Demo Studio",
    audience: audience || "Founders, operators, sales teams, and stakeholders",
    language_mode: language_mode || "presentation",
    style_system_id: style_system_id || "style-clean-growth-system",
  };
}

// ---- Busabase row <-> domain object normalization ----

export function normalizeProjectRow({
  project_id = "",
  ref = "",
  client_id = "",
  title = "",
  course = "",
  stage = "",
  owner = "",
  status = "needs_review",
  deck_count = 0,
  slide_count = 0,
  due_at = "",
  updated_at = "",
} = {}) {
  return {
    project_id,
    ref,
    client_id,
    title,
    course,
    stage,
    owner,
    status: status || "needs_review",
    deck_count: Number(deck_count) || 0,
    slide_count: Number(slide_count) || 0,
    due_at,
    updated_at,
  };
}

export function baseProjectFields({
  project_id = "",
  ref = "",
  client_id = "",
  title = "",
  course = "",
  stage = "",
  owner = "",
  status = "needs_review",
  deck_count = 0,
  slide_count = 0,
  due_at = "",
  updated_at = "",
} = {}) {
  return {
    project_id,
    ref: String(ref ?? ""),
    client_id,
    title,
    course,
    stage,
    owner,
    status,
    deck_count: Number(deck_count) || 0,
    slide_count: Number(slide_count) || 0,
    due_at,
    updated_at,
  };
}

export function normalizeDeckRow({
  deck_id = "",
  ref = "",
  project_id = "",
  title = "",
  theme = "",
  level = "",
  audience = "",
  status = "needs_review",
  target_slide_count = 0,
  approved_slide_count = 0,
  generated_slide_count = 0,
  style_score = 0,
  pptx_path = "",
  render_path = "",
  updated_at = "",
  review_summary = "",
  review_suggestions = "",
  review_draft_note = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  return {
    deck_id,
    ref,
    project_id,
    title,
    theme,
    level,
    audience,
    status: status || "needs_review",
    target_slide_count: Number(target_slide_count) || 0,
    approved_slide_count: Number(approved_slide_count) || 0,
    generated_slide_count: Number(generated_slide_count) || 0,
    style_score: Number(style_score) || 0,
    pptx_path,
    render_path,
    updated_at,
    review_summary,
    review_suggestions: parseJsonValue(review_suggestions, []) || [],
    review_draft_note,
    decision_action,
    decision_note,
    decided_at: decided_at || undefined,
    execution_status: execution_status || undefined,
    execution_operation: execution_operation || undefined,
    execution_target: execution_target || undefined,
    execution_detail: execution_detail || undefined,
    executed_at: executed_at || undefined,
  };
}

export function baseDeckFields({
  deck_id = "",
  ref = "",
  project_id = "",
  title = "",
  theme = "",
  level = "",
  audience = "",
  status = "needs_review",
  target_slide_count = 0,
  approved_slide_count = 0,
  generated_slide_count = 0,
  style_score = 0,
  pptx_path = "",
  render_path = "",
  updated_at = "",
  review_summary = "",
  review_suggestions = [],
  review_draft_note = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  return {
    deck_id,
    ref: String(ref ?? ""),
    project_id,
    title,
    theme,
    level,
    audience,
    status,
    target_slide_count: Number(target_slide_count) || 0,
    approved_slide_count: Number(approved_slide_count) || 0,
    generated_slide_count: Number(generated_slide_count) || 0,
    style_score: Number(style_score) || 0,
    pptx_path,
    render_path,
    updated_at,
    review_summary,
    review_suggestions: JSON.stringify(review_suggestions || []),
    review_draft_note,
    decision_action,
    decision_note,
    decided_at,
    execution_status,
    execution_operation,
    execution_target,
    execution_detail,
    executed_at,
  };
}

export function normalizeSlideRow({
  slide_id = "",
  ref = "",
  deck_id = "",
  project_id = "",
  status = "needs_review",
  slide_type = "",
  layout = "",
  title = "",
  objective = "",
  content_subtitle = "",
  content_chinese = "",
  content_pinyin = "",
  content_english = "",
  content_bullets = "",
  content_teacher_notes = "",
  content_interaction = "",
  content_image_prompt = "",
  asset_brief = "",
  style_checks = "",
  qa_flags = "",
  updated_at = "",
  review_summary = "",
  review_suggestions = "",
  review_draft_note = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  return {
    slide_id,
    ref,
    deck_id,
    project_id,
    status: status || "needs_review",
    slide_type,
    layout,
    title,
    objective,
    content: {
      subtitle: content_subtitle,
      chinese: content_chinese,
      pinyin: content_pinyin,
      english: content_english,
      bullets: parseJsonValue(content_bullets, []) || [],
      teacher_notes: content_teacher_notes,
      interaction: content_interaction,
      image_prompt: content_image_prompt,
    },
    asset_brief,
    style_checks: parseJsonValue(style_checks, []) || [],
    qa_flags: parseJsonValue(qa_flags, []) || [],
    updated_at,
    review_summary,
    review_suggestions: parseJsonValue(review_suggestions, []) || [],
    review_draft_note,
    decision_action,
    decision_note,
    decided_at: decided_at || undefined,
    execution_status: execution_status || undefined,
    execution_operation: execution_operation || undefined,
    execution_target: execution_target || undefined,
    execution_detail: execution_detail || undefined,
    executed_at: executed_at || undefined,
  };
}

/**
 * @param {{
 *   slide_id?: string,
 *   ref?: string,
 *   deck_id?: string,
 *   project_id?: string,
 *   status?: string,
 *   slide_type?: string,
 *   layout?: string,
 *   title?: string,
 *   objective?: string,
 *   content?: Record<string, any>,
 *   asset_brief?: string,
 *   style_checks?: string[],
 *   qa_flags?: string[],
 *   updated_at?: string,
 *   review_summary?: string,
 *   review_suggestions?: string[],
 *   review_draft_note?: string,
 *   decision_action?: string,
 *   decision_note?: string,
 *   decided_at?: string,
 *   execution_status?: string,
 *   execution_operation?: string,
 *   execution_target?: string,
 *   execution_detail?: string,
 *   executed_at?: string,
 * }} [args]
 */
export function baseSlideFields({
  slide_id = "",
  ref = "",
  deck_id = "",
  project_id = "",
  status = "needs_review",
  slide_type = "",
  layout = "",
  title = "",
  objective = "",
  content = {},
  asset_brief = "",
  style_checks = [],
  qa_flags = [],
  updated_at = "",
  review_summary = "",
  review_suggestions = [],
  review_draft_note = "",
  decision_action = "",
  decision_note = "",
  decided_at = "",
  execution_status = "",
  execution_operation = "",
  execution_target = "",
  execution_detail = "",
  executed_at = "",
} = {}) {
  const c = content || {};
  return {
    slide_id,
    ref: String(ref ?? ""),
    deck_id,
    project_id,
    status,
    slide_type,
    layout,
    title,
    objective,
    content_subtitle: c.subtitle || "",
    content_chinese: c.chinese || "",
    content_pinyin: c.pinyin || "",
    content_english: c.english || "",
    content_bullets: JSON.stringify(c.bullets || []),
    content_teacher_notes: c.teacher_notes || "",
    content_interaction: c.interaction || "",
    content_image_prompt: c.image_prompt || "",
    asset_brief,
    style_checks: JSON.stringify(style_checks || []),
    qa_flags: JSON.stringify(qa_flags || []),
    updated_at,
    review_summary,
    review_suggestions: JSON.stringify(review_suggestions || []),
    review_draft_note,
    decision_action,
    decision_note,
    decided_at,
    execution_status,
    execution_operation,
    execution_target,
    execution_detail,
    executed_at,
  };
}

export function normalizeStyleRow({
  style_system_id = "",
  name = "",
  palette = "",
  font_heading = "",
  font_body = "",
  font_chinese = "",
  visual_rules = "",
  layout_rules = "",
  component_library = "",
} = {}) {
  const fallback = defaultStyleSystem();
  const paletteArr = parseJsonValue(palette, []) || [];
  return {
    style_system_id: style_system_id || fallback.style_system_id,
    name: name || fallback.name,
    palette: paletteArr.length ? paletteArr : fallback.palette,
    fonts: {
      heading: font_heading || fallback.fonts.heading,
      body: font_body || fallback.fonts.body,
      chinese: font_chinese || fallback.fonts.chinese,
    },
    visual_rules: (parseJsonValue(visual_rules, []) || []).length
      ? parseJsonValue(visual_rules, [])
      : fallback.visual_rules,
    layout_rules: (parseJsonValue(layout_rules, []) || []).length
      ? parseJsonValue(layout_rules, [])
      : fallback.layout_rules,
    component_library: (parseJsonValue(component_library, []) || []).length
      ? parseJsonValue(component_library, [])
      : fallback.component_library,
  };
}

/**
 * @param {{
 *   style_system_id?: string,
 *   name?: string,
 *   palette?: string[],
 *   fonts?: Record<string, any>,
 *   visual_rules?: string[],
 *   layout_rules?: string[],
 *   component_library?: string[],
 * }} [args]
 */
export function baseStyleFields({
  style_system_id = "",
  name = "",
  palette = [],
  fonts = {},
  visual_rules = [],
  layout_rules = [],
  component_library = [],
} = {}) {
  return {
    style_system_id,
    name,
    palette: JSON.stringify(palette || []),
    font_heading: fonts?.heading || "",
    font_body: fonts?.body || "",
    font_chinese: fonts?.chinese || "",
    visual_rules: JSON.stringify(visual_rules || []),
    layout_rules: JSON.stringify(layout_rules || []),
    component_library: JSON.stringify(component_library || []),
  };
}

export function normalizeQaRow({
  check_id = "",
  target_id = "",
  target_type = "",
  rule = "",
  result = "pass",
  evidence = "",
  checked_at = "",
} = {}) {
  return { check_id, target_id, target_type, rule, result: result || "pass", evidence, checked_at };
}

export function normalizeExportRow({
  export_id = "",
  deck_id = "",
  status = "pending",
  format = "pptx",
  path = "",
  generated_at = "",
  qa_summary = "",
} = {}) {
  return { export_id, deck_id, status: status || "pending", format: format || "pptx", path, generated_at, qa_summary };
}

export function baseExportFields({
  export_id = "",
  deck_id = "",
  status = "pending",
  format = "pptx",
  path = "",
  generated_at = "",
  qa_summary = "",
} = {}) {
  return { export_id, deck_id, status, format, path, generated_at, qa_summary };
}

// Sanitized config summary for #/settings, ported in spirit from the retired
// local-file-provider.ts's summarizeConfig(). `style-systems` is the live
// list already read from the style_systems Base (never duplicated into
// settings); `settings` is the single settings row.
/**
 * @param {{ settings?: Record<string, any>, styleSystems?: Array<Record<string, any>> }} [args]
 */
export function buildConfigSummary({ settings = {}, styleSystems = [] } = {}) {
  const brand = normalizeBrand({
    client_id: settings.default_brand_id,
    name: settings.brand_name,
    audience: settings.brand_audience,
    language_mode: settings.brand_language_mode,
    style_system_id: settings.brand_style_system_id,
  });
  return {
    config_path: "busabase",
    is_example: false,
    default_brand_id: brand.client_id,
    brand_profiles: [brand],
    style_systems: styleSystems.length ? styleSystems : [defaultStyleSystem()],
    export: {
      out_dir: settings.export_out_dir || "exports",
      render_dir: settings.export_render_dir || "exports/rendered",
      pptx_template: settings.export_pptx_template || "",
      require_render_qa: boolField(settings.export_require_render_qa, true),
    },
  };
}

// ---- Metrics, ported verbatim in spirit from app/server/demo.ts's metrics
// object and lib/types.ts's Metrics shape ----

export function emptyMetrics() {
  return {
    project_count: 0,
    deck_count: 0,
    slide_count: 0,
    slides_needs_review: 0,
    slides_approved: 0,
    decks_generated: 0,
    qa_warnings: 0,
    avg_style_score: 0,
  };
}

export function recomputeMetrics(projects = [], decks = [], slideCards = [], qaChecks = []) {
  const metrics = emptyMetrics();
  metrics.project_count = projects.length;
  metrics.deck_count = decks.length;
  metrics.slide_count = slideCards.length;
  metrics.slides_needs_review = slideCards.filter(
    (item) => item.status === "needs_review" || item.status === "changes_requested",
  ).length;
  metrics.slides_approved = slideCards.filter((item) => item.status === "approved").length;
  metrics.decks_generated = decks.filter((item) => item.status === "generated" || item.status === "done").length;
  metrics.qa_warnings = qaChecks.filter(
    (item) => item.result === "warn" || item.result === "fail" || item.result === "manual",
  ).length;
  metrics.avg_style_score = decks.length
    ? Math.round(decks.reduce((sum, item) => sum + (Number(item.style_score) || 0), 0) / decks.length)
    : 0;
  return metrics;
}

// A row is "in the review queue" when the agent left a non-empty
// review_summary on it — replaces the retired review_items.json array. Each
// entry is reshaped into the retired ReviewItem shape so app.js's rendering
// stays close to the original.
export function deriveReviewItems(decks = [], slideCards = []) {
  const items = [];
  for (const deck of decks) {
    if (!deck.review_summary) continue;
    items.push({
      review_id: `deck:${deck.deck_id}`,
      ref: deck.ref,
      target_type: "deck",
      target_id: deck.deck_id,
      status: deck.status,
      summary: deck.review_summary,
      suggestions: deck.review_suggestions || [],
      draft_note: deck.review_draft_note || "",
      created_at: deck.updated_at,
    });
  }
  for (const slide of slideCards) {
    if (!slide.review_summary) continue;
    items.push({
      review_id: `slide:${slide.slide_id}`,
      ref: slide.ref,
      target_type: "slide",
      target_id: slide.slide_id,
      status: slide.status,
      summary: slide.review_summary,
      suggestions: slide.review_suggestions || [],
      draft_note: slide.review_draft_note || "",
      created_at: slide.updated_at,
    });
  }
  return items;
}

// New orchestration (not a port): derives a recent-activity feed from each
// row's own timestamps instead of reading a persisted activity_log.json,
// since Busabase reads are always live — same technique as
// kelly-legal-precedent-desk's deriveActivityLog.
export function deriveActivityLog(decks = [], slideCards = [], { limit = 20 } = {}) {
  const entries = [];
  for (const deck of decks) {
    if (deck.decided_at && deck.decision_action) {
      entries.push({
        id: `act-deck-${deck.deck_id}-${deck.decided_at}`,
        at: deck.decided_at,
        actor: "reviewer",
        detail: `${decisionLabel(deck.decision_action)} deck "${deck.title}"${deck.decision_note ? `: ${deck.decision_note}` : "."}`,
        target_id: deck.deck_id,
      });
    }
  }
  for (const slide of slideCards) {
    if (slide.decided_at && slide.decision_action) {
      entries.push({
        id: `act-slide-${slide.slide_id}-${slide.decided_at}`,
        at: slide.decided_at,
        actor: "reviewer",
        detail: `${decisionLabel(slide.decision_action)} slide "${slide.title}"${slide.decision_note ? `: ${slide.decision_note}` : "."}`,
        target_id: slide.slide_id,
      });
    }
  }
  return entries.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

function decisionLabel(action) {
  if (action === "approve") return "Approved";
  if (action === "request_changes") return "Requested changes on";
  if (action === "block") return "Blocked";
  return "Revised";
}

export function deriveWarnings(qaChecks = []) {
  return qaChecks
    .filter((item) => item.result === "warn" || item.result === "fail")
    .map((item) => ({
      id: `warn-${item.check_id}`,
      severity: item.result === "fail" ? "error" : "warning",
      target_id: item.target_id,
      message: item.rule,
      detail: item.evidence,
    }));
}

// Pure assembly on already-normalized rows plus a configSummary in
// buildConfigSummary()'s output shape. Used by the demo provider (fixtures
// already in this shape) and by buildSnapshot() below for the Busabase-row
// path.
/**
 * @param {{
 *   projects?: Array<Record<string, any>>,
 *   decks?: Array<Record<string, any>>,
 *   slideCards?: Array<Record<string, any>>,
 *   styleSystems?: Array<Record<string, any>>,
 *   qaChecks?: Array<Record<string, any>>,
 *   exportsList?: Array<Record<string, any>>,
 *   configSummary?: Record<string, any>,
 *   now?: string,
 *   source?: string,
 * }} [args]
 */
export function assembleSnapshot({
  projects = [],
  decks = [],
  slideCards = [],
  styleSystems = [],
  qaChecks = [],
  exportsList = [],
  configSummary = {},
  now = new Date().toISOString(),
  source = "kelly-ppt-factory",
} = {}) {
  return {
    schema_version: "1",
    generated_at: now,
    source,
    brand_profiles: configSummary.brand_profiles || [],
    style_systems: styleSystems.length ? styleSystems : configSummary.style_systems || [defaultStyleSystem()],
    projects,
    decks,
    slide_cards: slideCards,
    qa_checks: qaChecks,
    exports: exportsList,
    review_items: deriveReviewItems(decks, slideCards),
    activity_log: deriveActivityLog(decks, slideCards),
    warnings: deriveWarnings(qaChecks),
    metrics: recomputeMetrics(projects, decks, slideCards, qaChecks),
  };
}

// Busabase-row wrapper: normalizes the raw projects/decks/slide_cards/
// style_systems/qa_checks/exports rows read from Busabase (already
// snake_cased by the provider) into the shapes the UI expects, then calls
// assembleSnapshot().
export function buildSnapshot({
  projects = [],
  decks = [],
  slideCards = [],
  styleSystems = [],
  qaChecks = [],
  exportsList = [],
  settings = {},
  now = new Date().toISOString(),
  source = "kelly-ppt-factory",
} = {}) {
  const normalizedStyles = styleSystems.map(normalizeStyleRow);
  const configSummary = buildConfigSummary({ settings, styleSystems: normalizedStyles });
  return assembleSnapshot({
    projects: projects.map(normalizeProjectRow),
    decks: decks.map(normalizeDeckRow),
    slideCards: slideCards.map(normalizeSlideRow),
    styleSystems: normalizedStyles,
    qaChecks: qaChecks.map(normalizeQaRow),
    exportsList: exportsList.map(normalizeExportRow),
    configSummary,
    now,
    source,
  });
}

// Adapted (not a byte-for-byte port) from the retired
// scripts/execute_decisions.ts: maps a decided slide card or deck to the
// concrete follow-up operation the agent must perform outside the app, and
// the target the operation acts on. The retired script only ever wrote an
// execution_report.json summary and never touched workflow status itself;
// this Busabase-only shape follows the same conservative precedent as
// kelly-legal-precedent-desk's itemExecution() — it never flips workflow
// status itself (the decision write already did that), only records an
// execution marker directly on the row (execution_status/operation/target/
// detail/executed_at).
export function itemExecution(item, targetType, action, { apply = false } = {}) {
  if (action === "approve") {
    const operation = targetType === "deck" ? "approve_deck_for_pptx_generation" : "approve_slide_card";
    const target = targetType === "deck" ? item.deck_id : item.slide_id;
    return {
      operation,
      target,
      status: apply ? "ready_for_agent" : "planned",
      detail:
        targetType === "deck"
          ? `Run scripts/generate_pptx.mjs --deck=${target} to generate the approved PPTX.`
          : `Slide card ${target} is approved; it will be included the next time its deck is generated.`,
    };
  }
  if (action === "request_changes") {
    return {
      operation: "queue_agent_revision",
      target: targetType === "deck" ? item.deck_id : item.slide_id,
      status: apply ? "ready_for_agent" : "planned",
      detail: "Revise the slide card or deck plan per the review note, then resubmit for review.",
    };
  }
  if (action === "block") {
    return {
      operation: "block_generation",
      target: targetType === "deck" ? item.deck_id : item.slide_id,
      status: apply ? "ready_for_agent" : "planned",
      detail: "Generation is blocked until the review concern is resolved.",
    };
  }
  return {
    operation: "save_human_revision",
    target: targetType === "deck" ? item.deck_id : item.slide_id,
    status: apply ? "ready_for_agent" : "planned",
    detail: "Human revision note saved; item returns to the review queue.",
  };
}
