#!/usr/bin/env node
// Trusted hand-off step. Kelly Creators' AirApp only ever proposes an
// "approve" verdict on a creator engagement (writing status "approved" live);
// this script is the process authorized to act on that verdict. Per
// SKILL.md, outbound outreach, briefs, and contracts are always
// approval-required and sending is delegated to other skills (for example
// instagram-outreach, tiktok-outreach, kelly-email) after the user approves
// the specific item — this script performs NO sending, publishing, or
// contract execution itself. It only re-reads Busabase, marks each approved
// engagement `done`, and reports what still needs to be handed off, so
// repeated --apply runs stay idempotent.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads creator engagements with status "approved" from Busabase (quality-gate
items are skipped — they have no outbound handoff). Without --apply this is a
dry run that only prints what would be handed off. With --apply it writes
status "done" back onto each approved engagement — it still performs no
sending, publishing, or contract execution itself; that is delegated to
another skill per SKILL.md.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

// Map an approved proposed_action to a concrete connector operation. Real
// sends (outreach DMs, briefs, contracts) are delegated to other skills per
// SKILL.md; this only records the intended handoff.
const OPERATION_BY_ACTION = {
  send_outreach: { operation: "send_outreach" },
  send_brief: { operation: "send_brief", format: "pdf" },
  draft_contract: { operation: "draft_contract", format: "pdf" },
};

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
    throw new Error("Kelly Creators Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const creatorsBase = resources.bases.find((base) => base.key === "creators");
  const page = await client.records.list({ baseId: creatorsBase.baseId, limit: creatorsBase.readLimit });
  const records = Array.isArray(page) ? page : page.records || [];

  const results = [];
  for (const record of records) {
    const fields = normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields);
    if (fields.status !== "approved") continue;
    if (fields.item_type === "quality_gate") continue;
    const mapping = OPERATION_BY_ACTION[fields.proposed_action];
    if (!mapping) continue;
    const entry = {
      creator_id: fields.creator_id,
      ref: fields.ref,
      handle: fields.handle,
      name: fields.name,
      channel: fields.channel,
      target: fields.handle || fields.name || fields.creator_id,
      draft: fields.suggested_reply,
      reason: fields.reason,
      ...mapping,
      status: apply ? "handed_off" : "dry_run",
    };
    results.push(entry);
    if (apply) {
      await client.records.changeRequest({
        recordId: record.id,
        operation: "update",
        fields: toBusabaseFields({ ...fields, status: "done", decided_at: new Date().toISOString() }),
        message: `Hand off creator engagement ${fields.creator_id}`,
        author: "kelly-creators-executor",
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
