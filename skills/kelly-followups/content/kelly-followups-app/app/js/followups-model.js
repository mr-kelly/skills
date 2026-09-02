// Pure domain logic for kelly-followups. One feature only, per its PRD's own
// non-goals: record a followup, see today's list, mark it done.

function isBlank(value) {
  return !String(value ?? "").trim();
}

export function normalizeFollowupRow(row) {
  return {
    record_id: row.record_id || "",
    meeting: row.meeting || "",
    person: row.person || "",
    action: row.action || "",
    due: row.due || "",
    status: row.status === "done" ? "done" : "pending",
    created_at: row.created_at || "",
  };
}

export const NORMALIZE_ROW_BY_KEY = { followups: normalizeFollowupRow };

// "Today" per the PRD's acceptance criteria: pending items whose due date is
// today or already past. No calendar sync, no scheduled notification -- the
// PRD explicitly defers both; this is the "open it and see" version.
export function isDueToday(row, todayIso) {
  if (row.status === "done") return false;
  if (isBlank(row.due)) return true; // no date set: always due
  return row.due <= todayIso;
}

export function buildSnapshot({ followups = [] }, todayIso) {
  const normalized = (Array.isArray(followups) ? followups : []).map(normalizeFollowupRow);
  const today = normalized.filter((row) => isDueToday(row, todayIso));
  const upcoming = normalized.filter((row) => row.status === "pending" && !isDueToday(row, todayIso));
  const done = normalized.filter((row) => row.status === "done");
  return {
    followups: normalized,
    today,
    upcoming,
    done,
    counts: { today: today.length, upcoming: upcoming.length, done: done.length },
  };
}
