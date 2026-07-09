// Shared, provider-neutral helpers for kelly-standup: filesystem primitives, the
// deterministic snapshot math (recompute / metrics / merge), config + env
// loading, and the enum vocabularies used by the ingest validator. None of this
// is backend-specific — the local-file provider and the scripts both build on it,
// and the demo scene builder reuses recomputeDerived so demo output matches the
// real UI schema exactly.

import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH,
} from "./paths.ts";
import type {
  AgentTasks,
  Config,
  ConfigResult,
  ConfigSummary,
  Decisions,
  ExecutionReport,
  Lock,
  Onboarding,
  StandupSnapshot,
} from "./types.ts";

export const UPDATE_SOURCES = new Set(["slack", "wecom", "discord", "whatsapp", "doc", "manual"]);
export const MOODS = new Set(["good", "ok", "stuck"]);
export const SEVERITIES = new Set(["high", "medium", "low"]);
export const BLOCKER_STATUSES = new Set(["open", "resolved"]);
export const REMINDER_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
export const REMINDER_TYPES = new Set(["missing_checkin", "blocker_escalation"]);
export const REMINDER_CHANNELS = new Set(["slack", "wecom", "discord", "whatsapp", "email"]);
export const WORKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const REMINDER_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function emptySnapshot(): StandupSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-standup",
    team: { name: "", timezone: "", workdays: ["mon", "tue", "wed", "thu", "fri"] },
    today: "",
    members: [],
    days: [],
    blockers: [],
    reminders: [],
    metrics: {
      member_count: 0,
      active_member_count: 0,
      submitted_today: 0,
      expected_today: 0,
      on_leave_today: 0,
      missing_today: 0,
      open_blockers: 0,
      high_open_blockers: 0,
      reminders_needs_review: 0,
      avg_participation_30d: 0,
    },
    sync_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message: "No standup snapshot exists yet. Collect updates, then run ingest_updates.ts.",
      },
    ],
  };
}

function sortedDays(snapshot) {
  return [...(snapshot.days || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function latestDay(snapshot) {
  const days = sortedDays(snapshot);
  return days[days.length - 1] || null;
}

// Recompute per-day participation and per-member streak / participation / blocker
// counts from days[] and blockers[]. Deterministic: same snapshot in, same out.
export function recomputeDerived(snapshot) {
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

export function computeMetrics(snapshot) {
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

export function isoAddDays(isoDate, delta) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// Overlay user decisions and the latest execution report onto reminder items.
export function mergeSnapshot(snapshot, decisions, executionReport) {
  const verdicts = decisions?.decisions || {};
  const execById = new Map();
  for (const result of executionReport?.results || []) {
    if (result?.id) execById.set(result.id, result);
  }
  const reminders = (snapshot.reminders || []).map((reminder) => {
    let decision = verdicts[reminder.id] || reminder.decision || null;
    // A decision recorded before the reminder's last content revision (e.g. an
    // agent re-draft + re-ingest after "request changes") is stale: the human
    // never reviewed the revised content, so it must not keep pinning the item
    // to the old verdict/draft. Let the freshly-ingested needs_review + draft
    // through instead, per the documented revise -> re-ingest -> needs_review loop.
    if (decision?.decided_at && reminder.revised_at && reminder.revised_at > decision.decided_at) {
      decision = null;
    }
    const reportEntry = execById.get(reminder.id);
    const execution =
      reminder.execution ||
      (reportEntry
        ? {
            status: reportEntry.status,
            operations: reportEntry.operations || [],
            detail: reportEntry.detail || "",
            executed_at: executionReport?.generated_at || "",
          }
        : null);
    let status = reminder.status;
    if (decision?.action === "approve") status = "approved";
    if (decision?.action === "request_changes") status = "changes_requested";
    if (decision?.action === "block") status = "blocked";
    if (execution?.status === "executed") status = "done";
    return {
      ...reminder,
      status,
      decision,
      draft: decision?.draft ?? reminder.draft,
      execution,
    };
  });
  return { ...snapshot, reminders };
}

export async function loadDotenvFiles(files) {
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export function configSearchPaths() {
  const paths = [];
  if (process.env.KELLY_STANDUP_CONFIG) paths.push(process.env.KELLY_STANDUP_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-standup", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function envSearchPaths() {
  const paths = [];
  if (process.env.KELLY_STANDUP_ENV_FILE) paths.push(process.env.KELLY_STANDUP_ENV_FILE);
  paths.push(path.resolve(SKILL_DIR, "..", "..", ".env"));
  paths.push(path.join(SKILL_DIR, ".env.local"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-standup", ".env"));
  return paths;
}

export async function readConfig(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: { members: [] }, path: "", is_example: false };
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const members = Array.isArray(config.members) ? config.members : [];
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    team: {
      name: config.team?.name || "",
      timezone: config.team?.timezone || "",
      workdays: Array.isArray(config.team?.workdays) ? config.team.workdays : [],
    },
    members: members.map((member) => ({
      member_id: member.member_id || "",
      name: member.name || member.member_id || "",
      role: member.role || "",
      timezone: member.timezone || "",
      channel: member.channel || "",
      active: member.active !== false,
      contact_env: member.contact_env || "",
      contact_ready: Boolean(member.contact_env && process.env[member.contact_env]),
    })),
    standup_questions: Array.isArray(config.standup_questions) ? config.standup_questions : [],
    digest_style: config.digest?.style || "concise",
  };
}

// Convenience readers with the same defaults the store has always used. The
// local-file provider builds on these; scripts import them directly to read the
// current snapshot / decisions / report before writing.
export function readSnapshot(): Promise<StandupSnapshot> {
  return readJson(SNAPSHOT_PATH, emptySnapshot());
}

export function readOnboarding(): Promise<Onboarding> {
  return readJson(ONBOARDING_PATH, { completed: false });
}

export function readLock(): Promise<Lock | null> {
  return readJson(LOCK_PATH, null);
}

export function readDecisions(): Promise<Decisions> {
  return readJson(DECISIONS_PATH, { updated_at: "", decisions: {} });
}

export function readAgentTasks(): Promise<AgentTasks> {
  return readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] });
}

export function readExecutionReport(): Promise<ExecutionReport | null> {
  return readJson(EXECUTION_REPORT_PATH, null);
}

// Re-export for callers that still refer to the config shape by name.
export type { Config };
