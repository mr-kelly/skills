#!/usr/bin/env node
// Trusted execution step. Kelly PR Review's AirApp only ever writes a human
// verdict (approve / comment / request_changes / no_action / needs_review /
// block) onto a review record in Busabase — the browser cannot invoke the
// local `gh` CLI. This script is the process authorized to act on an
// `approved` verdict: unlike a "no-op, hands off elsewhere" executor, THIS
// skill's whole purpose per SKILL.md is executing the approved review, so
// with --apply it submits the REAL `gh pr review` call. Without --apply it is
// a dry run that only prints the command it would run.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

const execFile = promisify(execFileCallback);

function help() {
  console.log(`Usage: node scripts/execute_decisions.mjs [--apply]

Reads review items with status "approved" from Busabase. Without --apply this
is a dry run that only prints the "gh pr review" command that would run. With
--apply it submits the real review through the gh CLI (approve / comment /
request-changes) and writes execution-status "executed" + status "done" back
onto the record. Never merges, closes, pushes, edits branches, or re-runs
workflows.`);
}

const REVIEW_ACTIONS = new Set(["approve", "comment", "request_changes", "no_action"]);

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));
// records.get({baseId, fieldSlug, valueText}) is typed narrower than the
// records.list() shape read above (only headCommit.fields, no top-level
// fields fallback); accept it loosely here. Mirrors busabase-provider.js's
// findRecord(): a missing record raises NOT_FOUND rather than resolving to null.
/** @param {any} record */
const rawFieldsOf = (record) => record?.headCommit?.payload || record?.headCommit?.fields || record?.fields || {};
async function findByFieldSlug(client, baseId, fieldSlug, valueText) {
  try {
    return await client.records.get({ baseId, fieldSlug, valueText });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function gh(args) {
  const { stdout, stderr } = await execFile("gh", args, { maxBuffer: 1024 * 1024 * 5 });
  return { stdout, stderr };
}

function reviewFlag(action) {
  if (action === "approve") return "--approve";
  if (action === "request_changes") return "--request-changes";
  return "--comment";
}

async function submitReview(fields, apply) {
  const action = fields.decision_action;
  const body = fields.review_body || fields.decision_note || "";
  if (action === "no_action") return { status: "skipped", reason: "No action selected." };
  const tempPath = path.join(
    os.tmpdir(),
    `kelly-pr-review-${String(fields.repo).replaceAll("/", "-")}-${fields.number}-${Date.now()}.txt`,
  );
  await fs.writeFile(tempPath, body || "Reviewed from Kelly PR Review.", "utf8");
  try {
    const args = [
      "pr",
      "review",
      String(fields.number),
      "--repo",
      fields.repo,
      reviewFlag(action),
      "--body-file",
      tempPath,
    ];
    if (!apply) return { status: "dry_run", command: `gh ${args.join(" ")}` };
    await gh(args);
    return { status: "executed", command: `gh ${args.join(" ")}` };
  } finally {
    await fs.rm(tempPath, { force: true });
  }
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
    throw new Error("Kelly PR Review Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const reviewsBase = resources.bases.find((base) => base.key === "reviews");
  const page = await client.records.list({ baseId: reviewsBase.baseId, limit: reviewsBase.readLimit });
  const records = Array.isArray(page) ? page : page.records || [];

  const results = [];
  for (const record of records) {
    const fields = normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields);
    if (fields.status !== "approved") continue;
    if (!REVIEW_ACTIONS.has(fields.decision_action)) continue;

    // Re-read this specific record immediately before executing so a
    // concurrent revocation/edit in the UI is respected instead of acting on
    // a stale in-memory snapshot, and so an item already executed by a prior
    // run of this script is never submitted to GitHub twice.
    const fresh = await findByFieldSlug(client, reviewsBase.baseId, "item-id", fields.item_id);
    const freshFields = normalizeFields(fresh ? rawFieldsOf(fresh) : undefined);
    if (!fresh || freshFields.status !== "approved" || freshFields.execution_status === "executed") {
      results.push({
        item_id: fields.item_id,
        repo: fields.repo,
        number: fields.number,
        status: "skipped",
        reason: "Approval was revoked or already executed before this run reached it.",
      });
      continue;
    }

    const outcome = await submitReview(freshFields, apply);
    const executedAt = new Date().toISOString();
    results.push({
      item_id: freshFields.item_id,
      repo: freshFields.repo,
      number: freshFields.number,
      ...outcome,
      executed_at: executedAt,
    });

    if (apply && (outcome.status === "executed" || outcome.status === "skipped")) {
      await client.records.changeRequest({
        recordId: fresh.id,
        operation: "update",
        fields: toBusabaseFields({
          ...freshFields,
          status: outcome.status === "executed" ? "done" : freshFields.status,
          execution_status: outcome.status,
          execution_detail: JSON.stringify({
            command: outcome.command,
            reason: outcome.reason,
            executed_at: executedAt,
          }),
          updated_at: executedAt,
        }),
        message: `Execute approved review for ${freshFields.item_id}`,
        author: "kelly-pr-review-executor",
        baseCommitId: fresh.headCommitId || fresh.headCommit?.id,
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
