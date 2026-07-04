#!/usr/bin/env node
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/standup_snapshot.json", import.meta.url).pathname;

const SOURCES = new Set(["slack", "wecom", "discord", "whatsapp", "doc", "manual"]);
const MOODS = new Set(["good", "ok", "stuck", ""]);
const SEVERITIES = new Set(["high", "medium", "low"]);
const BLOCKER_STATUSES = new Set(["open", "resolved"]);
const REMINDER_STATUSES = new Set(["needs_review", "changes_requested", "approved", "done", "blocked"]);
const REMINDER_TYPES = new Set(["missing_checkin", "blocker_escalation"]);
const REMINDER_CHANNELS = new Set(["slack", "wecom", "discord", "whatsapp", "email"]);
const WORKDAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj, key, path, allowEmpty = false) {
  if (typeof obj[key] !== "string" || (!allowEmpty && obj[key].length === 0)) {
    fail(`${path}.${key} must be a non-empty string`);
  }
}

function requireNumber(obj, key, path) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

function requireEnum(obj, key, path, allowed) {
  if (!allowed.has(obj[key])) fail(`${path}.${key} has invalid value: ${obj[key]}`);
}

function requireIsoDate(obj, key, path, allowEmpty = false) {
  const value = obj[key];
  if (allowEmpty && value === "") return;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  ) {
    fail(`${path}.${key} must be a YYYY-MM-DD date`);
  }
}

function requireStringArray(obj, key, path) {
  if (!Array.isArray(obj[key]) || obj[key].some((item) => typeof item !== "string")) {
    fail(`${path}.${key} must be an array of strings`);
  }
}

const raw = await fs.readFile(target, "utf8").catch((error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${error.message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
requireIsoDate(snapshot, "today", "root", true);
if (!isObject(snapshot.team)) fail("root.team must be an object");
requireStringArray(snapshot.team, "workdays", "root.team");
for (const day of snapshot.team.workdays) {
  if (!WORKDAYS.has(day)) fail(`root.team.workdays has invalid value: ${day}`);
}
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "member_count",
  "active_member_count",
  "submitted_today",
  "expected_today",
  "on_leave_today",
  "missing_today",
  "open_blockers",
  "high_open_blockers",
  "reminders_needs_review",
  "avg_participation_30d",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
for (const key of ["members", "days", "blockers", "reminders", "sync_log", "warnings"]) {
  if (!Array.isArray(snapshot[key])) fail(`root.${key} must be an array`);
}

const memberIds = new Set();
snapshot.members.forEach((member, index) => {
  const path = `root.members[${index}]`;
  if (!isObject(member)) fail(`${path} must be an object`);
  for (const key of ["member_id", "name"]) requireString(member, key, path);
  if (memberIds.has(member.member_id)) fail(`${path}.member_id duplicates ${member.member_id}`);
  memberIds.add(member.member_id);
  requireNumber(member, "streak", path);
  requireNumber(member, "participation_30d", path);
  requireNumber(member, "open_blockers", path);
  requireIsoDate(member, "last_submitted_date", path, true);
});

const blockerIds = new Set();
snapshot.blockers.forEach((blocker, index) => {
  const path = `root.blockers[${index}]`;
  if (!isObject(blocker)) fail(`${path} must be an object`);
  for (const key of ["blocker_id", "member_id", "text"]) requireString(blocker, key, path);
  requireEnum(blocker, "severity", path, SEVERITIES);
  requireEnum(blocker, "status", path, BLOCKER_STATUSES);
  requireIsoDate(blocker, "raised_date", path);
  requireIsoDate(blocker, "resolved_date", path, true);
  if (blocker.status === "resolved" && !blocker.resolved_date)
    fail(`${path}.resolved_date is required for resolved blockers`);
  if (blockerIds.has(blocker.blocker_id)) fail(`${path}.blocker_id duplicates ${blocker.blocker_id}`);
  blockerIds.add(blocker.blocker_id);
  if (!memberIds.has(blocker.member_id)) fail(`${path}.member_id does not match a member: ${blocker.member_id}`);
});

const dayDates = new Set();
snapshot.days.forEach((day, index) => {
  const path = `root.days[${index}]`;
  if (!isObject(day)) fail(`${path} must be an object`);
  requireIsoDate(day, "date", path);
  if (dayDates.has(day.date)) fail(`${path}.date duplicates ${day.date}`);
  dayDates.add(day.date);
  requireString(day, "digest", path, true);
  if (!Array.isArray(day.updates)) fail(`${path}.updates must be an array`);
  if (day.on_leave !== undefined) {
    requireStringArray(day, "on_leave", path);
    for (const memberId of day.on_leave) {
      if (!memberIds.has(memberId)) fail(`${path}.on_leave has unknown member: ${memberId}`);
    }
  }
  if (!isObject(day.participation)) fail(`${path}.participation must be an object`);
  for (const key of ["submitted", "expected"]) requireNumber(day.participation, key, `${path}.participation`);

  const updateMembers = new Set();
  day.updates.forEach((update, updateIndex) => {
    const updatePath = `${path}.updates[${updateIndex}]`;
    if (!isObject(update)) fail(`${updatePath} must be an object`);
    requireString(update, "member_id", updatePath);
    if (!memberIds.has(update.member_id)) fail(`${updatePath}.member_id does not match a member: ${update.member_id}`);
    if (updateMembers.has(update.member_id))
      fail(`${updatePath}.member_id duplicates an update for ${update.member_id} on ${day.date}`);
    updateMembers.add(update.member_id);
    requireStringArray(update, "yesterday", updatePath);
    requireStringArray(update, "today", updatePath);
    requireEnum(update, "source", updatePath, SOURCES);
    if (update.mood !== undefined && !MOODS.has(update.mood))
      fail(`${updatePath}.mood has invalid value: ${update.mood}`);
    requireString(update, "submitted_at", updatePath);
    if (Number.isNaN(Date.parse(update.submitted_at))) fail(`${updatePath}.submitted_at must be an ISO timestamp`);
    if (!Array.isArray(update.blockers)) fail(`${updatePath}.blockers must be an array`);
    update.blockers.forEach((blocker, blockerIndex) => {
      const blockerPath = `${updatePath}.blockers[${blockerIndex}]`;
      if (!isObject(blocker)) fail(`${blockerPath} must be an object`);
      requireString(blocker, "blocker_id", blockerPath);
      requireString(blocker, "text", blockerPath);
      requireEnum(blocker, "severity", blockerPath, SEVERITIES);
      requireEnum(blocker, "status", blockerPath, BLOCKER_STATUSES);
      if (!blockerIds.has(blocker.blocker_id))
        fail(`${blockerPath}.blocker_id does not match a registered blocker: ${blocker.blocker_id}`);
    });
  });
});

const reminderIds = new Set();
const reminderRefs = new Set();
snapshot.reminders.forEach((reminder, index) => {
  const path = `root.reminders[${index}]`;
  if (!isObject(reminder)) fail(`${path} must be an object`);
  for (const key of ["id", "member_id", "title", "draft"]) requireString(reminder, key, path);
  requireString(reminder, "reason", path, true);
  requireNumber(reminder, "ref", path);
  requireEnum(reminder, "type", path, REMINDER_TYPES);
  requireEnum(reminder, "channel", path, REMINDER_CHANNELS);
  requireEnum(reminder, "status", path, REMINDER_STATUSES);
  if (reminderIds.has(reminder.id)) fail(`${path}.id duplicates ${reminder.id}`);
  reminderIds.add(reminder.id);
  if (reminderRefs.has(reminder.ref)) fail(`${path}.ref duplicates ${reminder.ref}`);
  reminderRefs.add(reminder.ref);
  if (!memberIds.has(reminder.member_id)) fail(`${path}.member_id does not match a member: ${reminder.member_id}`);
});

snapshot.sync_log.forEach((entry, index) => {
  const path = `root.sync_log[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["at", "source", "action"]) requireString(entry, key, path);
});

snapshot.warnings.forEach((warning, index) => {
  const path = `root.warnings[${index}]`;
  if (!isObject(warning)) fail(`${path} must be an object`);
  for (const key of ["id", "severity", "message"]) requireString(warning, key, path);
});

console.log(`OK: ${target}`);
