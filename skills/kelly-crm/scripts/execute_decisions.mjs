#!/usr/bin/env node
// Trusted hand-off step. Kelly CRM's AirApp only ever proposes a review
// decision on a followup record; this script is the process authorized to act
// on an `approved` verdict. It performs NO external send itself — sending is
// delegated to another skill (for example kelly-email) per SKILL.md — it only
// re-reads Busabase, marks the followup `done` with a handoff record, and
// reports what still needs to be sent.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-crm-app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads followups with status "approved" from Busabase. Without --apply this is
a dry run that only prints what would be handed off. With --apply it writes
status "done" plus handoff metadata back onto each approved followup — it
still performs no external send.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly CRM Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const followupsBase = resources.bases.find((base) => base.key === "followups");
  const page = await client.records.list({ baseId: followupsBase.baseId, limit: followupsBase.readLimit });
  const records = Array.isArray(page) ? page : page.records || [];

  const results = [];
  for (const record of records) {
    const fields = normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields);
    if (fields.status !== "approved") continue;
    const entry = {
      followup_id: fields.followup_id,
      ref: fields.ref,
      channel: fields.channel_id,
      target_contact_id: fields.contact_id,
      operation: "handoff_to_email",
      draft: fields.suggested_reply,
      reason: fields.reason,
      status: apply ? "handed_off" : "dry_run",
    };
    results.push(entry);
    if (apply) {
      await client.records.changeRequest({
        recordId: record.id,
        operation: "update",
        fields: toBusabaseFields({ ...fields, status: "done", decided_at: new Date().toISOString() }),
        message: `Hand off follow-up ${fields.followup_id}`,
        author: "kelly-crm-executor",
        baseCommitId: record.headCommitId || record.headCommit?.id,
        autoMerge: true,
      });
    }
  }

  console.log(JSON.stringify({ executed_at: new Date().toISOString(), dry_run: !apply, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
