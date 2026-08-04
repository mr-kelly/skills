// Pure domain logic for kelly-standup. recomputeDerived / computeMetrics /
// isoAddDays / latestDay are ported verbatim (same variable names, same order
// of operations, only TS types stripped) from the retired lib/common.ts —
// the deterministic streak / participation / metrics math is unchanged.
// normalizeMember/normalizeBlocker/normalizeCheckin/normalizeReminder and
// buildSnapshot/buildConfigSummary are new: they turn Busabase
// `members`/`days`/`checkins`/`blockers`/`reminders`/`settings` rows
// (already snake_cased by the provider) into the StandupSnapshot shape
// documented in references/standup-schema.md.

export const UPDATE_SOURCES = new Set(["slack", "wecom", "discord", "whatsapp", "doc", "manual"]);
export const MOODS = new Set(["good", "ok", "stuck"]);
export const SEVERITIES = new Set(["high", "medium", "low"]);
export const BLOCKER_STATUSES = new Set(["open", "resolved"]);
export const REMINDER_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
export const REMINDER_STATUS_SET = new Set(REMINDER_STATUSES);
export const REMINDER_TYPES = new Set(["missing_checkin", "blocker_escalation"]);
export const REMINDER_CHANNELS = new Set(["slack", "wecom", "discord", "whatsapp", "email"]);
export const WORKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DEFAULT_WORKDAYS = ["mon", "tue", "wed", "thu", "fri"];
export const REMINDER_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

// Verdict -> reminder.status, ported from the retired local-file provider's
// saveDecision(): approve/request_changes/block change status; "revise" (a
// human edit of the draft/note without a verdict, labeled "Save note" in the
// UI) never changes status.
export function statusForAction(action, currentStatus = "needs_review") {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return currentStatus;
}

function sortedDays(snapshot = {}) {
  return [...(snapshot.days || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function latestDay(snapshot = {}) {
  const days = sortedDays(snapshot);
  return days[days.length - 1] || null;
}

export function isoAddDays(isoDate, delta) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// Recompute per-day participation and per-member streak / participation /
// blocker counts from days[] and blockers[]. Deterministic: same snapshot
// in, same out. Ported verbatim from lib/common.ts.
export function recomputeDerived(snapshot = {}) {
  const days = sortedDays(snapshot);
  snapshot.days = days;
  const members = snapshot.members || [];
  const activeIds = new Set(members.filter((member) => member.active !== false).map((member) => member.member_id));

  for (const day of days) {
    const onLeave = new Set(day.on_leave || []);
    const submitted = (day.updates || []).filter((update) => activeIds.has(update.member_id)).length;
    day.participation = { submitted, expected: activeIds.size, on_leave: onLeave.size };
  }

  const today = snapshot.today || (days.length ? days[days.length - 1].date : "");
  const windowStart = today ? isoAddDays(today, -29) : "";

  for (const member of members) {
    let streak = 0;
    let streakBroken = false;
    let last = "";
    let windowDays = 0;
    let windowSubmitted = 0;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      const day = days[i];
      const onLeave = (day.on_leave || []).includes(member.member_id);
      const submitted = (day.updates || []).some((update) => update.member_id === member.member_id);
      if (submitted && !last) last = day.date;
      if (!streakBroken && !onLeave) {
        if (submitted) streak += 1;
        else streakBroken = true;
      }
      if (windowStart && day.date >= windowStart && !onLeave) {
        windowDays += 1;
        if (submitted) windowSubmitted += 1;
      }
    }
    member.streak = streak;
    member.last_submitted_date = last;
    member.participation_30d = windowDays ? Math.round((windowSubmitted / windowDays) * 100) / 100 : 0;
    member.open_blockers = (snapshot.blockers || []).filter(
      (blocker) => blocker.member_id === member.member_id && blocker.status === "open",
    ).length;
  }

  snapshot.metrics = computeMetrics(snapshot);
  return snapshot;
}

export function computeMetrics(snapshot = {}) {
  const members = snapshot.members || [];
  const active = members.filter((member) => member.active !== false);
  const day = latestDay(snapshot);
  const submitted = day?.participation?.submitted ?? 0;
  const expected = day?.participation?.expected ?? active.length;
  const onLeave = day?.participation?.on_leave ?? 0;
  const openBlockers = (snapshot.blockers || []).filter((blocker) => blocker.status === "open");
  const participation = active.length
    ? active.reduce((sum, member) => sum + (member.participation_30d || 0), 0) / active.length
    : 0;
  return {
    member_count: members.length,
    active_member_count: active.length,
    submitted_today: submitted,
    expected_today: expected,
    on_leave_today: onLeave,
    missing_today: Math.max(0, expected - submitted - onLeave),
    open_blockers: openBlockers.length,
    high_open_blockers: openBlockers.filter((blocker) => blocker.severity === "high").length,
    reminders_needs_review: (snapshot.reminders || []).filter((reminder) => reminder.status === "needs_review").length,
    avg_participation_30d: Math.round(participation * 100) / 100,
  };
}

// ---- Normalization: Busabase rows -> snapshot item shapes ----

function parseJsonList(value = "") {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toBool(value) {
  return value === true || value === "true";
}

export function normalizeMember(row = {}) {
  return {
    member_id: row.member_id || "",
    name: row.name || row.member_id || "",
    role: row.role || "",
    timezone: row.timezone || "",
    channel: row.channel || "",
    active: row.active === undefined || row.active === "" ? true : toBool(row.active),
    contact_env: row.contact_env || "",
    streak: 0,
    participation_30d: 0,
    open_blockers: 0,
    last_submitted_date: "",
    notes: row.notes || "",
  };
}

export function normalizeBlocker(row = {}) {
  return {
    blocker_id: row.blocker_id || "",
    member_id: row.member_id || "",
    raised_date: row.raised_date || "",
    severity: row.severity || "medium",
    status: row.status || "open",
    text: row.text || "",
    suggested_action: row.suggested_action || "",
    resolved_date: row.resolved_date || "",
  };
}

export function normalizeCheckin(row = {}) {
  return {
    member_id: row.member_id || "",
    date: row.date || "",
    yesterday: parseJsonList(row.yesterday),
    today: parseJsonList(row.today),
    blockers: parseJsonList(row.blockers),
    mood: row.mood || "",
    submitted_at: row.submitted_at || "",
    source: row.source || "manual",
    raw_excerpt: row.raw_excerpt || "",
  };
}

export function normalizeReminder(row = {}) {
  return {
    id: row.reminder_id || "",
    type: row.type || "missing_checkin",
    member_id: row.member_id || "",
    channel: row.channel || "slack",
    title: row.title || "",
    reason: row.reason || "",
    draft: row.draft || "",
    status: row.status || "needs_review",
    created_at: row.created_at || "",
    revised_at: row.revised_at || "",
    decision: row.decision_action
      ? { action: row.decision_action, note: row.decision_note || "", draft: null, decided_at: row.decided_at || "" }
      : null,
    execution: row.execution_status
      ? {
          status: row.execution_status,
          operations: parseJsonList(row.execution_operations),
          detail: row.execution_detail || "",
          executed_at: row.executed_at || "",
        }
      : null,
    __recordId: row.__recordId,
    __headCommitId: row.__headCommitId,
  };
}

// Ported from local-file-provider.ts's reminder.ref assignment, adapted for
// Busabase reads that have no guaranteed insertion order: refs are assigned
// by a stable created_at ascending sort so a nudge's "Reminder #N" stays put
// across reloads regardless of the page order records.list returns.
function withReminderRefs(reminders) {
  const ordered = reminders
    .slice()
    .sort((a, b) => String(a.created_at || a.id).localeCompare(String(b.created_at || b.id)));
  const refById = new Map(ordered.map((reminder, index) => [reminder.id, index + 1]));
  return reminders.map((reminder) => ({ ...reminder, ref: refById.get(reminder.id) || 0 }));
}

// Assemble the full StandupSnapshot from raw Busabase rows (already
// snake_cased by busabase-provider.js's normalizeFields()). checkins are
// grouped by date into each day's updates[], mirroring the retired
// ingest_updates.ts's day.updates[] shape exactly.
/**
 * @param {{
 *   members?: Array<Record<string, any>>,
 *   days?: Array<Record<string, any>>,
 *   checkins?: Array<Record<string, any>>,
 *   blockers?: Array<Record<string, any>>,
 *   reminders?: Array<Record<string, any>>,
 *   settings?: Record<string, any>,
 * }} [args]
 */
export function buildSnapshot({
  members = [],
  days = [],
  checkins = [],
  blockers = [],
  reminders = [],
  settings = {},
} = {}) {
  const normalizedMembers = members.map(normalizeMember);
  const normalizedBlockers = blockers.map(normalizeBlocker);
  const normalizedReminders = withReminderRefs(reminders.map(normalizeReminder));

  const checkinsByDate = new Map();
  for (const row of checkins) {
    const checkin = normalizeCheckin(row);
    if (!checkin.date) continue;
    if (!checkinsByDate.has(checkin.date)) checkinsByDate.set(checkin.date, []);
    checkinsByDate.get(checkin.date).push(checkin);
  }

  const normalizedDays = days
    .map((row) => ({
      date: row.date || "",
      digest: row.digest || "",
      on_leave: parseJsonList(row.on_leave),
      updates: checkinsByDate.get(row.date || "") || [],
      participation: { submitted: 0, expected: 0, on_leave: 0 },
    }))
    .filter((day) => day.date);

  const today = normalizedDays.reduce((max, day) => (day.date > max ? day.date : max), "");
  const teamWorkdays = parseJsonList(settings.team_workdays);

  const snapshot = {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source: "kelly-standup",
    team: {
      name: settings.team_name || "",
      timezone: settings.team_timezone || "",
      workdays: teamWorkdays.length ? teamWorkdays : [...DEFAULT_WORKDAYS],
    },
    today,
    members: normalizedMembers,
    days: normalizedDays,
    blockers: normalizedBlockers,
    reminders: normalizedReminders,
    metrics: {},
    warnings: normalizedMembers.length
      ? []
      : [{ id: "no-members", severity: "info", message: "No team members configured yet." }],
  };
  recomputeDerived(snapshot);
  return snapshot;
}

// Sanitized config summary for #/settings — never exposes contact values or
// secrets, only the env-var *name* a member's contact lives in (matching the
// retired summarizeConfig()'s contact_env exposure). contact_ready here only
// reflects "a contact env name is configured on the roster", not that the
// env var is actually set: the browser has no access to process.env, only
// scripts/execute_decisions.mjs (a trusted Node process) can verify that.
/**
 * @param {{ settings?: Record<string, any>, members?: Array<Record<string, any>> }} [args]
 */
export function buildConfigSummary({ settings = {}, members = [] } = {}) {
  return {
    config_path: "busabase",
    is_example: false,
    team: {
      name: settings.team_name || "",
      timezone: settings.team_timezone || "",
      workdays: parseJsonList(settings.team_workdays),
    },
    members: members.map((row) => ({
      member_id: row.member_id || "",
      name: row.name || row.member_id || "",
      role: row.role || "",
      timezone: row.timezone || "",
      channel: row.channel || "",
      active: row.active === undefined || row.active === "" ? true : toBool(row.active),
      contact_env: row.contact_env || "",
      contact_ready: Boolean(row.contact_env),
    })),
    standup_questions: parseJsonList(settings.standup_questions),
    digest_style: settings.digest_style || "concise",
  };
}
