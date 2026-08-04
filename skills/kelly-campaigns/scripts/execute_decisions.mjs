#!/usr/bin/env node
// Trusted hand-off step. Kelly Campaigns' AirApp only ever proposes a review
// decision on a send; this script is the process authorized to act on an
// `approved` verdict. It performs NO external side effect — it never calls an
// ESP, never sends mail, never mutates a subscriber list. Real
// scheduling/sending is delegated to the configured ESP by the skill, only
// after this script's dry-run/--apply report, per SKILL.md's boundary. It
// re-reads Busabase, re-checks the SEND quality gate, deliverability risk,
// and the consent/suppression list, then marks each approved send `done` and
// reports the handoff operation the ESP still needs to perform.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { createBusabaseClient } from "busabase-sdk";
import { buildSnapshot, checkSuppression } from "../app/app/js/campaigns-model.js";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads sends with status "approved" from Busabase. Without --apply this is a
dry run that only prints what would be handed off. With --apply it writes
status "done" back onto each send that clears every safety gate — it still
performs no ESP call, no send, and no list mutation itself. Real
scheduling/sending happens through the configured ESP, a separate,
explicitly authorized step.`);
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

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) return help();
  const apply = args.has("--apply");
  const esp = process.env.KELLY_CAMPAIGNS_ESP || "configured-esp";

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Campaigns Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);
  const [segmentRows, sendRows, suppressionRows] = await Promise.all([
    readAll(client, declared("segments")),
    readAll(client, declared("sends")),
    readAll(client, declared("suppression")),
  ]);
  const snapshot = buildSnapshot({ segments: segmentRows, sends: sendRows, suppression: suppressionRows });

  const now = new Date().toISOString();
  const results = [];

  for (const send of snapshot.sends) {
    if (send.status !== "approved") continue;

    // Safety gate: never hand off a send the SEND audit blocked or with high
    // deliverability risk, even though it carries an `approved` status.
    if (send.quality_gate?.verdict === "block" || send.deliverability?.risk === "high") {
      results.push({
        send_id: send.send_id,
        ref: send.ref,
        status: "blocked",
        operation: "none",
        reason: "Quality gate BLOCK or high deliverability risk; refusing to hand off.",
        executed_at: now,
      });
      continue;
    }

    // Consent/suppression gate: block if an explicitly-targeted suppressed
    // address is present; otherwise carry the excluded count as a note.
    const suppression = checkSuppression(send, suppressionRows);
    if (suppression.blocked) {
      results.push({
        send_id: send.send_id,
        ref: send.ref,
        status: "blocked",
        operation: "none",
        suppressed_excluded: suppression.suppressed_count,
        reason: suppression.note || "A suppressed address is explicitly targeted; refusing to hand off.",
        executed_at: now,
      });
      continue;
    }

    const isAbTest = send.proposed_action === "ab_test";
    const entry = {
      send_id: send.send_id,
      ref: send.ref,
      status: apply ? "handed_off" : "dry_run",
      operation: isAbTest ? "ab_test" : "schedule_send",
      esp,
      segment_id: send.segment_id || "",
      send_at: send.send_at || "",
      variants: isAbTest ? 2 : undefined,
      chosen_variant: send.chosen_variant || undefined,
      suppressed_excluded: suppression.suppressed_count || undefined,
      reason: send.reason || "",
      executed_at: now,
    };
    results.push(entry);

    if (apply) {
      const record = sendRows.find((row) => row.send_id === send.send_id);
      if (record) {
        const { __recordId, __headCommitId, ...currentFields } = record;
        await client.records.changeRequest({
          recordId: __recordId,
          operation: "update",
          fields: toBusabaseFields({ ...currentFields, status: "done", decided_at: now }),
          message: `Hand off send ${send.send_id} to ${esp}`,
          author: "kelly-campaigns-executor",
          baseCommitId: __headCommitId,
          autoMerge: true,
        });
      }
    }
  }

  if (!results.length) {
    console.log("No approved sends to hand off.");
    return;
  }
  console.log(JSON.stringify({ executed_at: now, dry_run: !apply, source: "kelly-campaigns", esp, results }, null, 2));
  if (!apply) console.log("Dry run only. Re-run with --apply to mark sends done in Busabase.");
  console.log("Real scheduling/sending must be performed by the ESP per SKILL.md.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
