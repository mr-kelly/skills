#!/usr/bin/env node
// Single write path for parsed standup updates. The agent does the LLM work of
// turning raw material (kelly-messenger snapshots, chat exports, shared docs,
// pasted text) into the payload shape documented in references/standup-schema.md;
// this script validates and merges deterministically: it upserts updates by
// member + date (re-ingesting the same payload is idempotent), upserts blockers
// by a stable content hash (including open -> resolved transitions), upserts
// agent-drafted reminders, recomputes participation / streaks / metrics, and
// appends sync_log. It refuses to run while agent.lock exists and takes the
// lock while writing.
// Usage: node scripts/ingest_updates.mjs <payload.json> [more-payloads.json...]

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { LOCK_PATH, SNAPSHOT_PATH } from "../app/server/paths.ts";
import {
  BLOCKER_STATUSES,
  MOODS,
  REMINDER_CHANNELS,
  REMINDER_STATUSES,
  REMINDER_TYPES,
  SEVERITIES,
  UPDATE_SOURCES,
  emptySnapshot,
  ensureDirs,
  readConfig,
  readJson,
  readLock,
  readSnapshot,
  recomputeDerived,
  writeJson,
} from "../app/server/store.ts";

const payloadFiles = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

function fail(message) {
  console.error(`kelly-standup ingest: ${message}`);
  process.exit(1);
}

if (!payloadFiles.length) fail("usage: node scripts/ingest_updates.mjs <payload.json> [...]");

await ensureDirs();

const existingLock = await readLock();
if (existingLock) {
  fail(
    `agent.lock exists (owner: ${existingLock.owner}, started ${existingLock.started_at}). Wait for the other run to finish.`,
  );
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function isIsoDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  );
}

function stringList(value, path) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${path} must be an array of strings`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

await writeJson(LOCK_PATH, {
  owner: "kelly-standup",
  message: "Ingesting standup update payloads",
  started_at: new Date().toISOString(),
});

try {
  const snapshot = await readSnapshot();
  const base = snapshot.schema_version ? snapshot : emptySnapshot();
  const configResult = await readConfig();
  const config = configResult.config || {};

  // Seed team profile and roster from config so the ingest payload only needs
  // member ids. Config members are upserted (never removed) by member_id.
  if (config.team) {
    base.team = {
      name: config.team.name || base.team?.name || "",
      timezone: config.team.timezone || base.team?.timezone || "",
      workdays:
        Array.isArray(config.team.workdays) && config.team.workdays.length
          ? config.team.workdays
          : base.team?.workdays || ["mon", "tue", "wed", "thu", "fri"],
    };
  }
  base.members = base.members || [];
  for (const member of Array.isArray(config.members) ? config.members : []) {
    if (!member.member_id) continue;
    const existing = base.members.find((entry) => entry.member_id === member.member_id);
    if (existing) {
      existing.name = member.name || existing.name;
      existing.role = member.role || existing.role;
      existing.timezone = member.timezone || existing.timezone;
      existing.channel = member.channel || existing.channel;
      existing.active = member.active !== false;
    } else {
      base.members.push({
        member_id: member.member_id,
        name: member.name || member.member_id,
        role: member.role || "",
        timezone: member.timezone || "",
        channel: member.channel || "",
        active: member.active !== false,
        streak: 0,
        participation_30d: 0,
        open_blockers: 0,
        last_submitted_date: "",
        notes: member.notes || "",
      });
    }
  }
  const memberIds = new Set(base.members.map((member) => member.member_id));

  base.days = base.days || [];
  base.blockers = base.blockers || [];
  base.reminders = base.reminders || [];
  base.sync_log = base.sync_log || [];
  const now = new Date().toISOString();
  let updatesUpserted = 0;
  let remindersUpserted = 0;

  for (const file of payloadFiles) {
    const payload = await readJson(file, null);
    if (!payload || typeof payload !== "object") fail(`${file} must contain a JSON payload object`);
    if (!isIsoDate(payload.date)) fail(`${file}: date must be YYYY-MM-DD`);
    const date = payload.date;
    const payloadSource = UPDATE_SOURCES.has(payload.source) ? payload.source : "manual";
    if (payload.updates !== undefined && !Array.isArray(payload.updates)) fail(`${file}: updates must be an array`);
    if (payload.reminders !== undefined && !Array.isArray(payload.reminders))
      fail(`${file}: reminders must be an array`);

    let day = base.days.find((entry) => entry.date === date);
    if (!day) {
      day = { date, digest: "", on_leave: [], updates: [], participation: { submitted: 0, expected: 0, on_leave: 0 } };
      base.days.push(day);
    }
    if (typeof payload.digest === "string" && payload.digest.trim()) day.digest = payload.digest.trim();
    if (payload.on_leave !== undefined) {
      const onLeave = stringList(payload.on_leave, `${file} on_leave`);
      for (const memberId of onLeave) {
        if (!memberIds.has(memberId)) fail(`${file} on_leave: unknown member_id ${memberId}`);
      }
      day.on_leave = [...new Set([...(day.on_leave || []), ...onLeave])];
    }

    let fileUpdates = 0;
    for (const [index, item] of (payload.updates || []).entries()) {
      const path = `${file} updates[${index}]`;
      if (!item || typeof item !== "object") fail(`${path} must be an object`);
      if (!memberIds.has(item.member_id))
        fail(`${path}: unknown member_id ${item.member_id}; add the member to config first`);
      const source = item.source === undefined ? payloadSource : item.source;
      if (!UPDATE_SOURCES.has(source)) fail(`${path}: invalid source ${source}`);
      if (item.mood !== undefined && item.mood !== "" && !MOODS.has(item.mood))
        fail(`${path}: invalid mood ${item.mood}`);
      if (item.submitted_at !== undefined && Number.isNaN(Date.parse(item.submitted_at))) {
        fail(`${path}: submitted_at must be an ISO timestamp`);
      }
      if (item.blockers !== undefined && !Array.isArray(item.blockers)) fail(`${path}: blockers must be an array`);

      const updateBlockers = (item.blockers || []).map((blocker, blockerIndex) => {
        const blockerPath = `${path}.blockers[${blockerIndex}]`;
        if (!blocker || typeof blocker.text !== "string" || !blocker.text.trim())
          fail(`${blockerPath}: text is required`);
        const severity = blocker.severity === undefined ? "medium" : blocker.severity;
        if (!SEVERITIES.has(severity)) fail(`${blockerPath}: invalid severity ${blocker.severity}`);
        const status = blocker.status === undefined ? "open" : blocker.status;
        if (!BLOCKER_STATUSES.has(status)) fail(`${blockerPath}: invalid status ${blocker.status}`);
        const text = blocker.text.trim();
        const blockerId = `bl-${sha1(`${item.member_id}|${text.toLowerCase()}`).slice(0, 10)}`;

        // Upsert into the top-level blocker registry, keeping the earliest
        // raised date and applying open -> resolved transitions.
        let registered = base.blockers.find((entry) => entry.blocker_id === blockerId);
        if (!registered) {
          registered = {
            blocker_id: blockerId,
            member_id: item.member_id,
            raised_date: date,
            severity,
            status,
            text,
            suggested_action: String(blocker.suggested_action || ""),
            resolved_date: status === "resolved" ? date : "",
          };
          base.blockers.push(registered);
        } else {
          if (date < registered.raised_date) registered.raised_date = date;
          if (blocker.severity) registered.severity = severity;
          if (blocker.suggested_action) registered.suggested_action = String(blocker.suggested_action);
          if (status === "resolved" && registered.status !== "resolved") {
            registered.status = "resolved";
            registered.resolved_date = date;
          }
          if (status === "open" && registered.status === "resolved" && date > (registered.resolved_date || "")) {
            registered.status = "open";
            registered.resolved_date = "";
          }
        }
        return { blocker_id: blockerId, text, severity, status };
      });

      const normalized = {
        member_id: item.member_id,
        yesterday: stringList(item.yesterday, `${path}.yesterday`),
        today: stringList(item.today, `${path}.today`),
        blockers: updateBlockers,
        mood: MOODS.has(item.mood) ? item.mood : "",
        submitted_at: item.submitted_at ? new Date(item.submitted_at).toISOString() : `${date}T00:00:00.000Z`,
        source,
        raw_excerpt: String(item.raw_excerpt || ""),
      };
      const existingIndex = day.updates.findIndex((entry) => entry.member_id === item.member_id);
      if (existingIndex >= 0) day.updates[existingIndex] = normalized;
      else day.updates.push(normalized);
      fileUpdates += 1;
    }

    let fileReminders = 0;
    const nextRef = () => Math.max(0, ...base.reminders.map((entry) => Number(entry.ref) || 0)) + 1;
    for (const [index, item] of (payload.reminders || []).entries()) {
      const path = `${file} reminders[${index}]`;
      if (!item || typeof item !== "object") fail(`${path} must be an object`);
      if (!REMINDER_TYPES.has(item.type)) fail(`${path}: invalid type ${item.type}`);
      if (!memberIds.has(item.member_id)) fail(`${path}: unknown member_id ${item.member_id}`);
      if (!REMINDER_CHANNELS.has(item.channel)) fail(`${path}: invalid channel ${item.channel}`);
      if (typeof item.draft !== "string" || !item.draft.trim()) fail(`${path}: draft is required`);
      const status = item.status === undefined ? "needs_review" : item.status;
      if (!REMINDER_STATUSES.has(status)) fail(`${path}: invalid status ${item.status}`);
      const id = String(item.id || `rem-${sha1(`${item.type}|${item.member_id}|${date}`).slice(0, 10)}`);
      const existing = base.reminders.find((entry) => entry.id === id);
      if (existing) {
        existing.title = String(item.title || existing.title);
        existing.reason = String(item.reason || existing.reason);
        existing.draft = item.draft.trim();
        existing.channel = item.channel;
        existing.status = status;
      } else {
        base.reminders.push({
          id,
          ref: nextRef(),
          type: item.type,
          member_id: item.member_id,
          channel: item.channel,
          title: String(item.title || `Reminder for ${item.member_id}`),
          reason: String(item.reason || ""),
          draft: item.draft.trim(),
          status,
          created_at: now,
          decision: null,
          execution: null,
        });
      }
      fileReminders += 1;
    }

    updatesUpserted += fileUpdates;
    remindersUpserted += fileReminders;
    base.sync_log.push({
      at: now,
      source: payloadSource,
      action: "ingest",
      detail: `Upserted ${fileUpdates} updates${fileReminders ? ` and ${fileReminders} reminders` : ""} for ${date} from ${file}.`,
      count: fileUpdates,
    });
  }

  base.generated_at = now;
  base.source = "kelly-standup";
  base.today = base.days.reduce((max, day) => (day.date > max ? day.date : max), base.today || "");
  base.warnings = (base.warnings || []).filter((warning) => warning.id !== "no-snapshot");
  recomputeDerived(base);
  await writeJson(SNAPSHOT_PATH, base);
  console.log(`Upserted ${updatesUpserted} updates and ${remindersUpserted} reminders into ${SNAPSHOT_PATH}`);
} finally {
  await fs.rm(LOCK_PATH, { force: true });
}
