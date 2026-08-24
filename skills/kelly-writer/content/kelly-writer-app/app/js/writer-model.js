// Pure domain logic for kelly-writer: turn normalized Busabase `drafts`
// records into the channel-draft review snapshot the UI renders. Ported
// (same status vocabulary, same decision mapping) from the retired
// app/app.js's itemStatus()/readinessFor() and
// lib/data-provider/local-file-provider.ts's saveDecision(). The old
// ideation stages (topics/todos/main_content) were already local-only,
// ephemeral, client-derived views per the retired SKILL.md ("The ideation
// stages ... are local-only; in busabase mode plan locally, then publish
// drafts to Busabase for review/merge") — this Busabase-only shape keeps
// only the durable unit of work: one review-queue record per channel draft.

export const DECISION_ACTIONS = ["approve", "request_changes", "block", "revise"];

const DECISION_STATUS = {
  approve: "approved",
  request_changes: "changes_requested",
  block: "blocked",
  revise: "needs_review",
};

// Verdict -> draft.status, ported verbatim from the retired app/app.js's
// itemStatus() (there applied client-side against a separate decisions map;
// here the decision is written directly onto the record so this is just the
// action->status half of that mapping).
export function statusForAction(action) {
  return DECISION_STATUS[action] || null;
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function countByStatus(drafts) {
  return {
    needs_review: drafts.filter((entry) => entry.status === "needs_review").length,
    to_approve: drafts.filter((entry) => entry.status === "to_approve").length,
    changes_requested: drafts.filter((entry) => entry.status === "changes_requested").length,
    approved: drafts.filter((entry) => entry.status === "approved").length,
    done: drafts.filter((entry) => entry.status === "done").length,
    blocked: drafts.filter((entry) => entry.status === "blocked").length,
  };
}

function countByChannel(drafts) {
  const counts = new Map();
  for (const draft of drafts) {
    if (!draft.channel) continue;
    counts.set(draft.channel, (counts.get(draft.channel) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([channel, count]) => ({ channel, count }));
}

// Normalize one raw `drafts` record (already snake_cased by the provider)
// into the draft-item shape the UI renders. Every destructured field carries
// a default so `checkJs` never infers a required-but-absent property. The
// JSON-list fields (hashtags/title_options/source_notes/risk) accept either
// the raw JSON-string a Busabase text field always holds, or an
// already-parsed array (defensive: some callers, like the demo dataset,
// pass real arrays directly).
/**
 * @param {{
 *   draft_id?: string, ref?: number, batch_id?: string, channel?: string,
 *   format?: string, title?: string, summary?: string, body?: string,
 *   hook?: string, cta?: string, hashtags?: string|unknown[],
 *   title_options?: string|unknown[], media_brief?: string,
 *   source_notes?: string|unknown[], risk?: string|unknown[],
 *   canonical_idea?: string, source_summary?: string, source_draft_path?: string,
 *   export_filename?: string, status?: string, created_at?: string,
 *   decision_note?: string, decided_at?: string, __recordId?: string,
 *   __headCommitId?: string,
 * }} [params]
 */
export function normalizeDraft({
  draft_id = "",
  ref = 0,
  batch_id = "",
  channel = "",
  format = "post",
  title = "",
  summary = "",
  body = "",
  hook = "",
  cta = "",
  hashtags = "",
  title_options = "",
  media_brief = "",
  source_notes = "",
  risk = "",
  canonical_idea = "",
  source_summary = "",
  source_draft_path = "",
  export_filename = "",
  status = "needs_review",
  created_at = "",
  decision_note = "",
  decided_at = "",
  __recordId = undefined,
  __headCommitId = undefined,
} = {}) {
  return {
    draft_id,
    ref: Number(ref || 0),
    batch_id,
    channel,
    format: format || "post",
    title,
    summary,
    body,
    hook,
    cta,
    hashtags: parseJsonList(hashtags),
    title_options: parseJsonList(title_options),
    media_brief,
    source_notes: parseJsonList(source_notes),
    risk: parseJsonList(risk),
    canonical_idea,
    source_summary,
    source_draft_path,
    export_filename,
    status: status || "needs_review",
    created_at,
    decision_note,
    decided_at,
    __recordId,
    __headCommitId,
  };
}

export function buildSnapshot({ drafts = [] } = {}) {
  const normalizedDrafts = drafts.map(normalizeDraft).sort((a, b) => Number(a.ref || 0) - Number(b.ref || 0));
  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-writer",
    metrics: countByStatus(normalizedDrafts),
    channels: countByChannel(normalizedDrafts),
    drafts: normalizedDrafts,
    warnings: [],
  };
}
