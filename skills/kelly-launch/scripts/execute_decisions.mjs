#!/usr/bin/env node
// Trusted hand-off step. Kelly Launch's AirApp only ever proposes a review
// decision on a launch item; this script is the process authorized to act
// on an `approved` verdict. It performs NO public submission or send itself
// — that is delegated to another skill (kelly-email for press/launch email,
// a channel connector for Product Hunt/HN) per SKILL.md. It only re-reads
// Busabase, marks the item `done`, and reports what still needs to be sent.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads launch items with status "approved" from Busabase. Without --apply this
is a dry run that only prints what would be handed off. With --apply it
writes status "done" back onto each approved item — it still performs no
public submission or send itself.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function operationFor(item) {
  if (item.proposed_action === "submit_channel") return { operation: "submit_channel", channel: item.channel_id };
  if (item.proposed_action === "send_pitch") return { operation: "send_pitch", channel: item.channel_id };
  if (item.proposed_action === "publish_asset")
    return { operation: "publish_asset", format: item.format || "markdown" };
  return { operation: "no_action" };
}

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
    throw new Error("Kelly Launch Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const itemsBase = resources.bases.find((base) => base.key === "items");
  const page = await client.records.list({ baseId: itemsBase.baseId, limit: itemsBase.readLimit });
  const records = Array.isArray(page) ? page : page.records || [];

  const results = [];
  for (const record of records) {
    const fields = normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields);
    if (fields.status !== "approved") continue;
    const entry = {
      item_id: fields.item_id,
      ref: fields.ref,
      title: fields.title,
      draft: fields.draft,
      reason: fields.reason,
      ...operationFor(fields),
      status: apply ? "handed_off" : "dry_run",
    };
    results.push(entry);
    if (apply) {
      await client.records.changeRequest({
        recordId: record.id,
        operation: "update",
        fields: toBusabaseFields({ ...fields, status: "done", decided_at: new Date().toISOString() }),
        message: `Hand off launch item ${fields.item_id}`,
        author: "kelly-launch-executor",
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
