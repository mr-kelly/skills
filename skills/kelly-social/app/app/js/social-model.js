// Pure domain logic for kelly-social: the social-qa (⛩) pre-publish quality
// gate, the monitoring rollup, and the normalization of Busabase
// accounts/posts/sync_log/calendar/drafts/shorts/engagement/settings rows
// into the SocialSnapshot shape the UI (app.js, js/publishing-views.js)
// renders. evaluateGate() is ported verbatim (same variable names, same order
// of operations, only TS types stripped) from the retired lib/social-qa.ts.
// rollup() is ported verbatim from the retired app/server/demo.ts. The
// review-status transition rules (BLOCK gate overrides approve; publish/send
// require a prior human approval) are ported from the retired
// lib/data-provider/publishing-ops.ts's applyPublishingOperation() reducer,
// adapted to per-record Busabase writes instead of a whole-snapshot reducer.

export const REVIEW_STATES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const REVIEW_STATE_SET = new Set(REVIEW_STATES);

// ─── social-qa (⛩): the pre-publish quality gate ────────────────────────────
// Given a draft's copy, run a small deterministic set of checks — brand
// voice, required disclosure, and banned claims — and roll them into a Social
// Quality Score (SQS, 0-100) with a SHIP / FIX / BLOCK verdict:
//
//   any fail  -> BLOCK  (a hard problem: banned claim, missing #ad disclosure)
//   any warn  -> FIX    (soft problem: off-voice, thin hook)
//   all pass  -> SHIP

// Absolute/unverifiable marketing claims a personal build-in-public brand
// should never ship without proof. Demo-safe, invented brand vocabulary.
const BANNED_CLAIMS = [
  "guaranteed",
  "guarantee",
  "100% secure",
  "risk-free",
  "get rich",
  "best in the world",
  "number one",
  "#1 in the world",
  "cure",
  "miracle",
];

// Words that signal paid / affiliate content and therefore require disclosure.
const PROMO_MARKERS = ["sponsor", "sponsored", "partner", "affiliate", "paid promotion", "ad:"];
const DISCLOSURE_MARKERS = ["#ad", "#sponsored", "#partner", "paid partnership"];

function text({ hook = "", body = "", cta = "", hashtags = [] } = {}) {
  return [hook, body, cta, (hashtags || []).join(" ")].filter(Boolean).join("\n").toLowerCase();
}

export function evaluateGate({ hook = "", body = "", hashtags = [], cta = "", channels = [] } = {}) {
  const input = { hook, body, hashtags, cta, channels };
  const blob = text(input);
  const checks = [];

  // 1. Banned / unverifiable claims -> hard fail (BLOCK).
  const hit = BANNED_CLAIMS.find((claim) => blob.includes(claim));
  checks.push({
    id: "banned-claims",
    label: "Banned claims",
    result: hit ? "fail" : "pass",
    note: hit ? `Contains an unverifiable claim: "${hit}".` : "No banned or absolute claims.",
  });

  // 2. Disclosure: if it reads as promotional, it must disclose.
  const looksPromo = PROMO_MARKERS.some((marker) => blob.includes(marker));
  const hasDisclosure = DISCLOSURE_MARKERS.some((marker) => blob.includes(marker));
  checks.push({
    id: "disclosure",
    label: "Disclosure",
    result: looksPromo && !hasDisclosure ? "fail" : "pass",
    note:
      looksPromo && !hasDisclosure
        ? "Reads as paid/partner content but has no #ad disclosure."
        : looksPromo
          ? "Promotional and discloses correctly."
          : "No disclosure required.",
  });

  // 3. Brand voice: build-in-public voice wants a real hook, not clickbait,
  //    and not ALL CAPS shouting. Soft problem -> warn (FIX).
  const trimmedHook = String(hook || "").trim();
  const shouting = /[A-Z]{6,}/.test(`${hook || ""} ${body || ""}`);
  const thinHook = trimmedHook.length > 0 && trimmedHook.length < 12;
  const voiceOk = trimmedHook.length >= 12 && !shouting;
  checks.push({
    id: "brand-voice",
    label: "Brand voice",
    result: voiceOk ? "pass" : "warn",
    note: shouting
      ? "All-caps shouting is off-brand for build-in-public."
      : thinHook
        ? "Hook is too thin to earn the scroll."
        : trimmedHook.length === 0
          ? "No hook — the first line has to do work."
          : "On-voice, specific hook.",
  });

  const fails = checks.filter((check) => check.result === "fail").length;
  const warns = checks.filter((check) => check.result === "warn").length;
  const score = Math.max(0, 100 - fails * 40 - warns * 15);
  const verdict = fails > 0 ? "BLOCK" : warns > 0 ? "FIX" : "SHIP";
  const summary =
    verdict === "BLOCK"
      ? "Blocked before publish — resolve the failing checks."
      : verdict === "FIX"
        ? "Publishable after a quick fix pass."
        : "Clears the gate. Safe to schedule.";

  return { verdict, score, checks, summary };
}

// ─── JSON longtext parsing helpers (Busabase rows are all-string fields) ────

function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseJsonList(value) {
  const parsed = parseJsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonObject(value) {
  const parsed = parseJsonValue(value, null);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

// ─── Monitoring rollup — ported verbatim from the retired app/server/demo.ts's
// rollup() (accepting already-normalized Account/Post objects). ────────────

export function rollup(accounts = [], posts = []) {
  const totals = accounts.reduce(
    (acc, item) => {
      acc.total_followers += item.metrics.followers;
      acc.followers_delta_7d += item.metrics.followers_delta_7d;
      acc.followers_delta_28d += item.metrics.followers_delta_28d || 0;
      acc.impressions_7d += item.metrics.impressions_7d;
      acc.engagements_7d += item.metrics.engagements_7d || 0;
      return acc;
    },
    {
      account_count: accounts.length,
      post_count: posts.length,
      total_followers: 0,
      followers_delta_7d: 0,
      followers_delta_28d: 0,
      impressions_7d: 0,
      engagements_7d: 0,
      engagement_rate_7d: 0,
    },
  );
  totals.engagement_rate_7d =
    totals.impressions_7d > 0 ? Number((totals.engagements_7d / totals.impressions_7d).toFixed(4)) : 0;
  return totals;
}

// ─── Normalization: Busabase rows (already snake_cased by the provider) ->
// snapshot item shapes. ───────────────────────────────────────────────────

const METRIC_DEFAULTS = {
  followers: 0,
  following: 0,
  posts: 0,
  impressions_7d: 0,
  impressions_28d: 0,
  engagements_7d: 0,
  engagement_rate_7d: 0,
  profile_visits_7d: 0,
  followers_delta_7d: 0,
  followers_delta_28d: 0,
};

export function normalizeAccount({
  account_id = "",
  platform = "",
  handle = "",
  display_name = "",
  profile_url = "",
  collection = "browser_agent",
  status = "ok",
  notes = "",
  metrics = "",
  follower_series = "",
  traffic_sources = "",
  last_sync_at = "",
} = {}) {
  return {
    account_id,
    platform,
    handle,
    display_name: display_name || handle || account_id,
    profile_url,
    collection,
    status: status || "ok",
    notes,
    metrics: { ...METRIC_DEFAULTS, ...(parseJsonObject(metrics) || {}) },
    follower_series: parseJsonList(follower_series),
    traffic_sources: parseJsonList(traffic_sources),
    last_sync_at,
  };
}

const POST_METRIC_DEFAULTS = { likes: 0, replies: 0, reposts: 0, views: 0, saves: 0, clicks: 0 };

export function normalizePost({
  post_id = "",
  platform = "",
  account_id = "",
  provider_post_id = "",
  posted_at = "",
  type = "post",
  text: postText = "",
  media = "none",
  media_count = 0,
  permalink = "",
  metrics = "",
  engagement_rate = 0,
  agent_notes = "",
  tags = "",
} = {}) {
  return {
    post_id,
    platform,
    account_id,
    provider_post_id: provider_post_id || post_id,
    posted_at,
    type,
    text: postText,
    media,
    media_count: Number(media_count) || 0,
    permalink,
    metrics: { ...POST_METRIC_DEFAULTS, ...(parseJsonObject(metrics) || {}) },
    engagement_rate: Number(engagement_rate) || 0,
    agent_notes,
    tags: parseJsonList(tags),
  };
}

export function normalizeSyncEntry({
  sync_id = "",
  account_id = "",
  method = "",
  started_at = "",
  completed_at = "",
  status = "ok",
  posts_collected = 0,
  message = "",
  actor = "",
} = {}) {
  return {
    sync_id,
    account_id,
    method,
    started_at,
    completed_at,
    status,
    posts_collected: Number(posts_collected) || 0,
    message,
    actor,
  };
}

export function normalizeCalendarEntry({
  entry_id = "",
  date = "",
  channel = "",
  pillar = "",
  title = "",
  status = "planned",
  draft_id = "",
  scheduled_for = "",
  notes = "",
} = {}) {
  const entry = { entry_id, date, channel, pillar, title, status, notes };
  if (draft_id) entry.draft_id = draft_id;
  if (scheduled_for) entry.scheduled_for = scheduled_for;
  return entry;
}

// A draft's social-qa gate is always recomputed live from its own copy — it
// is never trusted as stale stored state. A gate BLOCK forces the review
// status to "blocked" regardless of the record's own stored status, mirroring
// the retired demo.ts's demoDrafts() intake rule.
export function normalizeDraft({
  draft_id = "",
  channels = "",
  pillar = "",
  hook = "",
  body = "",
  hashtags = "",
  cta = "",
  status = "needs_review",
  scheduled_for = "",
  agent_notes = "",
  review_note = "",
  created_at = "",
  updated_at = "",
} = {}) {
  const parsedChannels = parseJsonList(channels);
  const parsedHashtags = parseJsonList(hashtags);
  const gate = evaluateGate({ hook, body, hashtags: parsedHashtags, cta, channels: parsedChannels });
  const effectiveStatus = gate.verdict === "BLOCK" ? "blocked" : REVIEW_STATE_SET.has(status) ? status : "needs_review";
  return {
    draft_id,
    channels: parsedChannels,
    pillar,
    hook,
    body,
    hashtags: parsedHashtags,
    cta,
    status: effectiveStatus,
    scheduled_for,
    gate,
    agent_notes,
    review_note,
    created_at,
    updated_at: updated_at || created_at,
  };
}

export function normalizeShort({
  short_id = "",
  channels = "",
  pillar = "",
  title = "",
  hook = "",
  status = "needs_review",
  duration_s = 0,
  shots = "",
  caption = "",
  hashtags = "",
  agent_notes = "",
  review_note = "",
  created_at = "",
  updated_at = "",
} = {}) {
  return {
    short_id,
    channels: parseJsonList(channels),
    pillar,
    title,
    hook,
    status: REVIEW_STATE_SET.has(status) ? status : "needs_review",
    duration_s: Number(duration_s) || 0,
    shots: parseJsonList(shots),
    caption,
    hashtags: parseJsonList(hashtags),
    agent_notes,
    review_note,
    created_at,
    updated_at: updated_at || created_at,
  };
}

export function normalizeEngagement({
  item_id = "",
  platform = "",
  account_id = "",
  kind = "comment",
  author_handle = "",
  incoming_text = "",
  received_at = "",
  sentiment = "neutral",
  priority = "normal",
  draft_reply = "",
  status = "needs_review",
  review_note = "",
  permalink = "",
} = {}) {
  return {
    item_id,
    platform,
    account_id,
    kind,
    author_handle,
    incoming_text,
    received_at,
    sentiment,
    priority,
    draft_reply,
    status: REVIEW_STATE_SET.has(status) ? status : "needs_review",
    review_note,
    permalink,
  };
}

const DEFAULT_CRISIS = { status: "calm", publishing_paused: false, steps: [] };
const DEFAULT_SHARE_OF_VOICE = { window: "7d", total_mentions: 0, entries: [] };

// Warnings are derived, never separately stored: any account whose status is
// not "ok" surfaces as a warning (message from its own `notes`), matching the
// retired demo/ingest behavior where collection problems (stale exports, rate
// limits) were reported per-account.
function buildWarnings(accounts) {
  return accounts
    .filter((account) => account.status && account.status !== "ok")
    .map((account) => ({
      id: `${account.account_id}-status`,
      severity: account.status === "error" ? "error" : "warning",
      account_id: account.account_id,
      message: account.notes || `${account.handle || account.account_id}: sync status is "${account.status}".`,
      detail: "",
    }));
}

/**
 * @param {{
 *   accounts?: Array<Record<string, any>>,
 *   posts?: Array<Record<string, any>>,
 *   sync_log?: Array<Record<string, any>>,
 *   calendar?: Array<Record<string, any>>,
 *   drafts?: Array<Record<string, any>>,
 *   shorts?: Array<Record<string, any>>,
 *   engagement?: Array<Record<string, any>>,
 *   crisis?: Record<string, any> | null,
 *   share_of_voice?: Record<string, any> | null,
 * }} [args]
 */
export function buildSnapshot({
  accounts = [],
  posts = [],
  sync_log = [],
  calendar = [],
  drafts = [],
  shorts = [],
  engagement = [],
  crisis = null,
  share_of_voice = null,
} = {}) {
  const normalizedAccounts = accounts.map(normalizeAccount);
  const normalizedPosts = posts
    .map(normalizePost)
    .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
  const postDates = normalizedPosts.map((post) => String(post.posted_at).slice(0, 10)).sort();

  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-social",
    range: { start: postDates[0] || "", end: postDates[postDates.length - 1] || "" },
    metrics: rollup(normalizedAccounts, normalizedPosts),
    accounts: normalizedAccounts,
    posts: normalizedPosts,
    sync_log: sync_log
      .map(normalizeSyncEntry)
      .sort(
        (a, b) =>
          new Date(b.completed_at || b.started_at).getTime() - new Date(a.completed_at || a.started_at).getTime(),
      ),
    warnings: buildWarnings(normalizedAccounts),
    calendar: calendar.map(normalizeCalendarEntry),
    drafts: drafts.map(normalizeDraft),
    shorts: shorts.map(normalizeShort),
    engagement: engagement.map(normalizeEngagement),
    crisis: crisis ? { ...DEFAULT_CRISIS, ...crisis } : DEFAULT_CRISIS,
    share_of_voice: share_of_voice ? { ...DEFAULT_SHARE_OF_VOICE, ...share_of_voice } : DEFAULT_SHARE_OF_VOICE,
  };
}

// ─── Review-status transition rules — ported from the retired
// lib/data-provider/publishing-ops.ts's applyPublishingOperation(). ─────────

// review_draft / review_short / review_engagement: validate the target status
// and, for drafts, forbid approving past a hard gate BLOCK.
export function assertReviewStatus(status) {
  if (!REVIEW_STATE_SET.has(status)) {
    throw new Error(`Invalid review status: ${status}. Expected one of ${REVIEW_STATES.join("|")}.`);
  }
  return status;
}

export function assertDraftApprovable(draft) {
  if (draft?.gate?.verdict === "BLOCK") {
    throw new Error("Cannot approve a draft the social-qa gate BLOCKed. Revise it first.");
  }
}

// publish_post: the draft must be human-approved and must not carry a BLOCK
// gate verdict. On success the caller sets status="done" (and scheduled_for)
// directly on the record — the app records intent only; the real platform
// action happens out of band after approval (see SKILL.md's Boundary).
export function assertDraftPublishable(draft) {
  if (draft?.gate?.verdict === "BLOCK") {
    throw new Error("Cannot publish a draft the social-qa gate BLOCKed.");
  }
  if (draft?.status !== "approved") {
    throw new Error("Cannot publish a draft that has not been human-approved.");
  }
}

// send_reply: the engagement item must be human-approved. On success the
// caller sets status="done" directly on the record.
export function assertReplySendable(item) {
  if (item?.status !== "approved") {
    throw new Error("Cannot send a reply that has not been human-approved.");
  }
}
