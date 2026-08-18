#!/usr/bin/env node
// Trusted hand-off step. Kelly Brand's AirApp only ever proposes an "adopt as
// canonical" decision on a narrative item (writing status "approved" live);
// this script is the process authorized to act on that verdict. Per
// SKILL.md, adopting an asset into the canonical brand narrative — and any
// downstream export — is the skill's responsibility after this script runs;
// it performs NO publishing or external side effect itself. It only
// re-reads Busabase and marks each approved item "done" once it has been
// folded into the canonical narrative, so repeated --apply runs stay
// idempotent.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads narrative items with status "approved" from Busabase. Without --apply
this is a dry run that only prints what would be promoted. With --apply it
writes status "done" back onto each approved item — it still performs no
publishing or channel export itself; that is the skill's job per SKILL.md.`);
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
    throw new Error("Kelly Brand Busabase resources are not provisioned yet; run the AirApp setup first.");
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
      type: fields.type,
      title: fields.title,
      operation: "promote_to_canonical",
      registry: "narrative",
      target: `canonical/${fields.type || "asset"}/${fields.item_id}`,
      status: apply ? "promoted" : "dry_run",
    };
    results.push(entry);
    if (apply) {
      await client.records.changeRequest({
        recordId: record.id,
        operation: "update",
        fields: toBusabaseFields({ ...fields, status: "done", decided_at: new Date().toISOString() }),
        message: `Promote narrative item ${fields.item_id} to canonical`,
        author: "kelly-brand-executor",
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
