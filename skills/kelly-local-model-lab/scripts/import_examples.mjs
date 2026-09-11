#!/usr/bin/env node
// Generic Busabase-to-training-examples importer. Any skill that produces
// human-reviewed prompt/response pairs can feed this fine-tuning workbench
// through it -- it is deliberately not written against any one skill's field
// names (kelly-support calls its pair "question"/"answer"; some other skill
// might call it something else). The caller maps its own shape onto
// { prompt, ideal_response, task?, source? } before calling this; this
// script does not know or care where a row came from.
//
// Usage:
//   node scripts/import_examples.mjs <input.json>            # dry run
//   node scripts/import_examples.mjs <input.json> --apply    # write for real
//
// <input.json> is an array of { prompt, ideal_response, task?, source? }.
//
// What this script does NOT do, on purpose:
//   - never sets status to anything but "needs_review" -- an imported example
//     is still unreviewed no matter how confident its source was;
//   - never re-imports a (prompt, ideal_response) pair it has already seen,
//     detected by content_hash, so running this twice on overlapping input
//     is a no-op for rows already present, not a duplicate;
//   - never assigns a split with a live random call -- split is derived
//     deterministically from content_hash, so re-running produces the exact
//     same train/valid/test assignment for the same content, which is what
//     "leakage-resistant grouping" from SKILL.md's export step depends on
//     staying stable across reruns.
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../content/kelly-local-model-lab-app/app/js/config.js";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function help() {
  console.log(`Usage: node scripts/import_examples.mjs <input.json> [--apply] [--task <default>]

Imports { prompt, ideal_response, task?, source? } rows into the
training-examples Base as status: needs_review. Every example still needs a
human review pass in the app before it can be exported or trained on --
this only gets it into the queue.

Without --apply this is a dry run that only reports what would be created.`);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  help();
  process.exit(args.length === 0 ? 1 : 0);
}

const apply = args.includes("--apply");
const inputPath = args.find((arg) => !arg.startsWith("--"));
const taskFlagIndex = args.indexOf("--task");
const defaultTask = taskFlagIndex >= 0 ? args[taskFlagIndex + 1] : "";
if (!inputPath) fail("Missing <input.json> argument.");

const required = (name) => {
  const value = process.env[name];
  if (!value)
    fail(
      `Missing env var ${name}. A trusted script needs its own Busabase credentials, never the AirApp's ambient session.`,
    );
  return value;
};

const client = createBusabaseClient({
  baseUrl: required("BUSABASE_BASE_URL"),
  apiKey: required("BUSABASE_API_KEY"),
  ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
});

function contentHash(prompt, idealResponse) {
  return createHash("sha256").update(prompt).update(" ").update(idealResponse).digest("hex").slice(0, 16);
}

// 80/10/10, deterministic from the hash so the same content always lands in
// the same split -- SKILL.md's export step groups by "source or another
// leakage-resistant grouping" and that only holds if split assignment never
// drifts between an import run and a later export run.
function splitFor(hash) {
  const bucket = Number.parseInt(hash.slice(0, 2), 16) % 10;
  if (bucket < 8) return "train";
  if (bucket < 9) return "valid";
  return "test";
}

let rows;
try {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  if (!Array.isArray(raw)) throw new Error("input must be a JSON array");
  rows = raw;
} catch (error) {
  fail(`Could not read ${inputPath}: ${error instanceof Error ? error.message : error}`);
}

const prepared = [];
for (const [index, row] of rows.entries()) {
  const prompt = String(row.prompt || "").trim();
  const idealResponse = String(row.ideal_response || "").trim();
  if (!prompt || !idealResponse) {
    console.warn(`  Skipping row ${index}: prompt or ideal_response is empty`);
    continue;
  }
  const hash = contentHash(prompt, idealResponse);
  prepared.push({
    example_id: `ex-${hash}`,
    task: String(row.task || defaultTask || "").trim() || "unspecified",
    prompt,
    ideal_response: idealResponse,
    split: splitFor(hash),
    status: "needs_review",
    source: String(row.source || "").trim(),
    content_hash: hash,
  });
}

let resources;
try {
  resources = await inspectProvisionedResources(client, appConfig);
} catch (error) {
  fail(`Failed to read the Busabase workspace: ${error instanceof Error ? error.message : error}`);
}
const base = resources.bases.find((entry) => entry.key === "training-examples");
if (!base) fail("The training-examples Base is missing. Run node scripts/setup.mjs --apply first.");

const existingHashes = new Set();
{
  const { records } = await client.records.list({ baseId: base.baseId, limit: 100 });
  for (const record of records || []) {
    const hash = (record.headCommit?.payload || record.headCommit?.fields)?.["content-hash"];
    if (hash) existingHashes.add(hash);
  }
}

const toCreate = prepared.filter((row) => !existingHashes.has(row.content_hash));
const skippedExisting = prepared.length - toCreate.length;

console.log(apply ? "Importing..." : "Dry run (nothing written). Re-run with --apply to write for real.");
console.log(`  Parsed ${prepared.length}, already present ${skippedExisting}, to create ${toCreate.length}`);
for (const row of toCreate) {
  console.log(`  [${row.split}] ${row.example_id}  ${row.prompt.slice(0, 40)}...`);
}

if (!apply || toCreate.length === 0) {
  if (!apply) console.log("Re-run with --apply to write for real.");
  process.exit(0);
}

for (const row of toCreate) {
  const fields = {
    "example-id": row.example_id,
    task: row.task,
    prompt: row.prompt,
    "ideal-response": row.ideal_response,
    split: row.split,
    status: row.status,
    source: row.source,
    "content-hash": row.content_hash,
  };
  await client.bases.createChangeRequest({
    baseId: base.baseId,
    fields,
    message: `Import training example ${row.example_id}`,
    submittedBy: appConfig.appId,
    autoMerge: true,
  });
  console.log(`  Created ${row.example_id}`);
}
console.log(`Done: created ${toCreate.length}, skipped ${skippedExisting} already present.`);
