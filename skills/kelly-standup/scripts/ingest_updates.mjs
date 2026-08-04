#!/usr/bin/env node
// Trusted write path for parsed standup updates. Parsing raw material (kelly-
// messenger snapshots, Slack/WeCom/Discord/WhatsApp exports, shared docs,
// pasted text) into the structured payload shape documented in
// references/standup-schema.md is LLM work the agent does in conversation —
// this script is the deterministic step that validates that payload and
// writes it into Busabase: it upserts checkins by member + date (re-ingesting
// the same payload is idempotent), upserts blockers by a stable content hash
// (including open -> resolved transitions), upserts agent-drafted reminders
// (resetting status to needs_review only when their content actually
// changed, so a human's pending decision on an unrevised reminder survives a
// re-ingest), and upserts the day's digest/on_leave list. Ported from the
// retired scripts/ingest_updates.ts: same validation rules, same blocker_id /
// reminder_id hashing, same idempotent-merge semantics — only the storage
// target changed, from app/.data/standup_snapshot.json to Busabase records.
//
// The retired script also seeded the roster from a private config.json; that
// role now belongs to this same script's optional payload.team/payload.members
// (see references/standup-schema.md), so onboarding writes team profile and
// member rows the same way a daily ingest writes checkins.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
// Writes are gated behind --apply (default dry run).
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";
import {
  BLOCKER_STATUSES,
  MOODS,
  REMINDER_CHANNELS,
  REMINDER_STATUS_SET,
  REMINDER_TYPES,
  SEVERITIES,
  UPDATE_SOURCES,
} from "../app/app/js/standup-model.js";

function help() {
  console.log(`Usage: node scripts/ingest_updates.mjs <payload.json> [more-payloads.json...] [--apply]

Validates one or more standup update payloads (see references/standup-schema.md)
and merges them into Busabase: upserts checkins by member + date, upserts
blockers by content hash (including open -> resolved transitions), upserts
reminders (resetting to needs_review only when title/reason/draft/channel
actually changed), and upserts the day's digest/on_leave list. A payload may
also carry "team" and/or "members" to seed/update the roster during
onboarding. Without --apply this is a dry run that only validates and prints
a summary.`);
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

function fail(message) {
  console.error(`kelly-standup ingest: ${message}`);
  process.exit(1);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function upsertRow(client, declared, existing, idField, idValue, fields, message, apply) {
  if (!apply) return existing ? "would_update" : "would_create";
  const normalized = toBusabaseFields(fields);
  if (existing) {
    await client.records.changeRequest({
      recordId: existing.__recordId,
      operation: "update",
      fields: normalized,
      message,
      author: "kelly-standup-ingest",
      baseCommitId: existing.__headCommitId,
      autoMerge: true,
    });
    return "updated";
  }
  await client.bases.createChangeRequest({
    baseId: declared.baseId,
    fields: normalized,
    message,
    submittedBy: "kelly-standup-ingest",
    autoMerge: true,
  });
  return "created";
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) return help();
  const apply = rawArgs.includes("--apply");
  const payloadFiles = rawArgs.filter((arg) => !arg.startsWith("--"));
  if (!payloadFiles.length) fail("usage: node scripts/ingest_updates.mjs <payload.json> [...] [--apply]");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Standup Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [memberRows, dayRows, checkinRows, blockerRows, reminderRows, settingsRows] = await Promise.all([
    readAll(client, declared("members")),
    readAll(client, declared("days")),
    readAll(client, declared("checkins")),
    readAll(client, declared("blockers")),
    readAll(client, declared("reminders")),
    readAll(client, declared("settings")),
  ]);
  const memberIds = new Set(memberRows.map((row) => row.member_id));
  const daysByDate = new Map(dayRows.map((row) => [row.date, row]));
  const checkinsByKey = new Map(checkinRows.map((row) => [row.checkin_id, row]));
  const blockersById = new Map(blockerRows.map((row) => [row.blocker_id, row]));
  const remindersById = new Map(reminderRows.map((row) => [row.reminder_id, row]));
  let settingsRow = settingsRows.find((row) => row.record_id === "team") || null;

  let updatesUpserted = 0;
  let remindersUpserted = 0;
  let blockersUpserted = 0;
  let membersUpserted = 0;

  for (const file of payloadFiles) {
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    if (!payload || typeof payload !== "object") fail(`${file} must contain a JSON payload object`);

    // Onboarding: optional team profile, upserted into the single settings row.
    if (payload.team) {
      const fields = {
        record_id: "team",
        team_name: payload.team.name || settingsRow?.team_name || "",
        team_timezone: payload.team.timezone || settingsRow?.team_timezone || "",
        team_workdays: JSON.stringify(
          Array.isArray(payload.team.workdays) && payload.team.workdays.length
            ? payload.team.workdays
            : JSON.parse(settingsRow?.team_workdays || "[]"),
        ),
        digest_style: payload.digest_style || settingsRow?.digest_style || "concise",
        standup_questions: JSON.stringify(
          Array.isArray(payload.standup_questions) && payload.standup_questions.length
            ? payload.standup_questions
            : JSON.parse(settingsRow?.standup_questions || "[]"),
        ),
      };
      await upsertRow(
        client,
        declared("settings"),
        settingsRow,
        "record-id",
        "team",
        fields,
        "Update kelly-standup team profile",
        apply,
      );
      if (apply) settingsRow = { ...settingsRow, __recordId: settingsRow?.__recordId, ...normalizeFields(fields) };
    }

    // Onboarding: optional roster upsert, mirroring the retired config.members
    // seeding in ingest_updates.ts (upserted, never removed, by member_id).
    for (const member of payload.members || []) {
      if (!member.member_id) fail(`${file} members[]: member_id is required`);
      const existing = memberRows.find((row) => row.member_id === member.member_id);
      const fields = {
        member_id: member.member_id,
        name: member.name || existing?.name || member.member_id,
        role: member.role || existing?.role || "",
        timezone: member.timezone || existing?.timezone || "",
        channel: member.channel || existing?.channel || "",
        active: member.active === undefined ? (existing?.active ?? "true") : String(member.active !== false),
        contact_env: member.contact_env || existing?.contact_env || "",
        notes: member.notes || existing?.notes || "",
      };
      await upsertRow(
        client,
        declared("members"),
        existing,
        "member-id",
        member.member_id,
        fields,
        `Upsert kelly-standup member ${member.member_id}`,
        apply,
      );
      memberIds.add(member.member_id);
      membersUpserted += 1;
    }

    if (!isIsoDate(payload.date)) fail(`${file}: date must be YYYY-MM-DD`);
    const date = payload.date;
    const payloadSource = UPDATE_SOURCES.has(payload.source) ? payload.source : "manual";
    if (payload.updates !== undefined && !Array.isArray(payload.updates)) fail(`${file}: updates must be an array`);
    if (payload.reminders !== undefined && !Array.isArray(payload.reminders))
      fail(`${file}: reminders must be an array`);

    const existingDay = daysByDate.get(date) || null;
    let onLeave = existingDay ? JSON.parse(existingDay.on_leave || "[]") : [];
    if (payload.on_leave !== undefined) {
      const requested = stringList(payload.on_leave, `${file} on_leave`);
      for (const memberId of requested) {
        if (!memberIds.has(memberId)) fail(`${file} on_leave: unknown member_id ${memberId}`);
      }
      onLeave = [...new Set([...onLeave, ...requested])];
    }
    const digest =
      typeof payload.digest === "string" && payload.digest.trim() ? payload.digest.trim() : existingDay?.digest || "";
    await upsertRow(
      client,
      declared("days"),
      existingDay,
      "date",
      date,
      { date, digest, on_leave: JSON.stringify(onLeave) },
      `Upsert kelly-standup day ${date}`,
      apply,
    );

    let fileUpdates = 0;
    for (const [index, item] of (payload.updates || []).entries()) {
      const path = `${file} updates[${index}]`;
      if (!item || typeof item !== "object") fail(`${path} must be an object`);
      if (!memberIds.has(item.member_id))
        fail(`${path}: unknown member_id ${item.member_id}; add the member to the payload's members[] first`);
      const source = item.source === undefined ? payloadSource : item.source;
      if (!UPDATE_SOURCES.has(source)) fail(`${path}: invalid source ${source}`);
      if (item.mood !== undefined && item.mood !== "" && !MOODS.has(item.mood))
        fail(`${path}: invalid mood ${item.mood}`);
      if (item.submitted_at !== undefined && Number.isNaN(Date.parse(item.submitted_at))) {
        fail(`${path}: submitted_at must be an ISO timestamp`);
      }
      if (item.blockers !== undefined && !Array.isArray(item.blockers)) fail(`${path}: blockers must be an array`);

      const updateBlockers = [];
      for (const [blockerIndex, blockerItem] of (item.blockers || []).entries()) {
        const blockerPath = `${path}.blockers[${blockerIndex}]`;
        if (!blockerItem || typeof blockerItem.text !== "string" || !blockerItem.text.trim())
          fail(`${blockerPath}: text is required`);
        const severity = blockerItem.severity === undefined ? "medium" : blockerItem.severity;
        if (!SEVERITIES.has(severity)) fail(`${blockerPath}: invalid severity ${blockerItem.severity}`);
        const status = blockerItem.status === undefined ? "open" : blockerItem.status;
        if (!BLOCKER_STATUSES.has(status)) fail(`${blockerPath}: invalid status ${blockerItem.status}`);
        const text = blockerItem.text.trim();
        const blockerId = `bl-${sha1(`${item.member_id}|${text.toLowerCase()}`).slice(0, 10)}`;

        // Upsert into the blocker registry, keeping the earliest raised date and
        // applying open -> resolved / resolved -> open transitions. Ported
        // verbatim from ingest_updates.ts.
        const registered = blockersById.get(blockerId);
        const nextRaisedDate = registered && date >= registered.raised_date ? registered.raised_date : date;
        const nextResolvedDate =
          status === "resolved"
            ? registered?.status === "resolved"
              ? registered.resolved_date
              : date
            : status === "open" && registered?.status === "resolved" && date > (registered.resolved_date || "")
              ? ""
              : registered?.resolved_date || "";
        const nextStatus =
          status === "resolved"
            ? "resolved"
            : status === "open" && registered?.status === "resolved" && date > (registered.resolved_date || "")
              ? "open"
              : registered?.status || status;
        const fields = {
          blocker_id: blockerId,
          member_id: item.member_id,
          raised_date: nextRaisedDate,
          severity: blockerItem.severity ? severity : registered?.severity || severity,
          status: nextStatus,
          text,
          suggested_action: blockerItem.suggested_action
            ? String(blockerItem.suggested_action)
            : registered?.suggested_action || "",
          resolved_date: nextResolvedDate,
        };
        await upsertRow(
          client,
          declared("blockers"),
          registered,
          "blocker-id",
          blockerId,
          fields,
          `Upsert kelly-standup blocker ${blockerId}`,
          apply,
        );
        blockersById.set(blockerId, { ...registered, __recordId: registered?.__recordId, ...fields });
        blockersUpserted += 1;
        updateBlockers.push({ blocker_id: blockerId, text, severity, status });
      }

      const checkinId = `${item.member_id}|${date}`;
      const fields = {
        checkin_id: checkinId,
        member_id: item.member_id,
        date,
        yesterday: JSON.stringify(stringList(item.yesterday, `${path}.yesterday`)),
        today: JSON.stringify(stringList(item.today, `${path}.today`)),
        blockers: JSON.stringify(updateBlockers),
        mood: MOODS.has(item.mood) ? item.mood : "",
        submitted_at: item.submitted_at ? new Date(item.submitted_at).toISOString() : `${date}T00:00:00.000Z`,
        source,
        raw_excerpt: String(item.raw_excerpt || ""),
      };
      await upsertRow(
        client,
        declared("checkins"),
        checkinsByKey.get(checkinId),
        "checkin-id",
        checkinId,
        fields,
        `Upsert kelly-standup checkin ${checkinId}`,
        apply,
      );
      fileUpdates += 1;
    }

    let fileReminders = 0;
    for (const [index, item] of (payload.reminders || []).entries()) {
      const path = `${file} reminders[${index}]`;
      if (!item || typeof item !== "object") fail(`${path} must be an object`);
      if (!REMINDER_TYPES.has(item.type)) fail(`${path}: invalid type ${item.type}`);
      if (!memberIds.has(item.member_id)) fail(`${path}: unknown member_id ${item.member_id}`);
      if (!REMINDER_CHANNELS.has(item.channel)) fail(`${path}: invalid channel ${item.channel}`);
      if (typeof item.draft !== "string" || !item.draft.trim()) fail(`${path}: draft is required`);
      const requestedStatus = item.status === undefined ? "needs_review" : item.status;
      if (!REMINDER_STATUS_SET.has(requestedStatus)) fail(`${path}: invalid status ${item.status}`);
      const id = String(item.id || `rem-${sha1(`${item.type}|${item.member_id}|${date}`).slice(0, 10)}`);
      const existing = remindersById.get(id);
      const nextTitle = String(item.title || existing?.title || `Reminder for ${item.member_id}`);
      const nextReason = String(item.reason || existing?.reason || "");
      const nextDraft = item.draft.trim();
      const now = new Date().toISOString();
      // Track real content revisions the same way the retired ingest_updates.ts
      // tracked revised_at: a re-ingest with unchanged content never disturbs a
      // human's pending decision on this reminder; a materially new draft
      // (e.g. after a request_changes -> agent re-draft loop) resets it to
      // needs_review and clears the prior verdict/execution.
      const revised = Boolean(
        existing &&
          (nextTitle !== existing.title ||
            nextReason !== existing.reason ||
            nextDraft !== existing.draft ||
            item.channel !== existing.channel),
      );
      const fields = existing
        ? {
            reminder_id: id,
            type: item.type,
            member_id: item.member_id,
            channel: item.channel,
            title: nextTitle,
            reason: nextReason,
            draft: nextDraft,
            status: revised ? "needs_review" : existing.status,
            created_at: existing.created_at || now,
            revised_at: revised ? now : existing.revised_at || "",
            decision_action: revised ? "" : existing.decision_action || "",
            decision_note: revised ? "" : existing.decision_note || "",
            decided_at: revised ? "" : existing.decided_at || "",
            execution_status: revised ? "" : existing.execution_status || "",
            execution_operations: revised ? "" : existing.execution_operations || "",
            execution_detail: revised ? "" : existing.execution_detail || "",
            executed_at: revised ? "" : existing.executed_at || "",
          }
        : {
            reminder_id: id,
            type: item.type,
            member_id: item.member_id,
            channel: item.channel,
            title: nextTitle,
            reason: nextReason,
            draft: nextDraft,
            status: "needs_review",
            created_at: now,
            revised_at: "",
            decision_action: "",
            decision_note: "",
            decided_at: "",
            execution_status: "",
            execution_operations: "",
            execution_detail: "",
            executed_at: "",
          };
      await upsertRow(
        client,
        declared("reminders"),
        existing,
        "reminder-id",
        id,
        fields,
        `Upsert kelly-standup reminder ${id}`,
        apply,
      );
      remindersById.set(id, { ...existing, __recordId: existing?.__recordId, ...fields });
      fileReminders += 1;
    }

    updatesUpserted += fileUpdates;
    remindersUpserted += fileReminders;
    console.log(
      `${file}: ${fileUpdates} update(s), ${fileReminders} reminder(s) for ${date}${apply ? "" : " (dry run)"}`,
    );
  }

  console.log(
    `${apply ? "Wrote" : "Would write"} ${updatesUpserted} update(s), ${blockersUpserted} blocker(s), ${remindersUpserted} reminder(s), ${membersUpserted} member(s) to Busabase.`,
  );
  if (!apply) console.log("Dry run only. Re-run with --apply to write to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
