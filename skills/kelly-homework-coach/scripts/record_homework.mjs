#!/usr/bin/env node
// Trusted hand-off step for how a new homework question/mistake/paper
// actually enters this skill. Kelly Homework Coach has no upload API route
// (grep of the retired app/server/hono.ts confirms it: only /api/state,
// /api/provider, /api/onboarding/complete, /api/decision) and the retired
// browser's "photo box" (app/app.js renderPhotoBox()) never uploaded a file
// anywhere — it only let the student pick a local filename and copied a
// chat prompt asking the agent to analyze it. The retired SKILL.md's
// "Homework Photo Workflow" confirms who actually wrote the data: the agent
// itself, in the same chat session, merged the analyzed question straight
// into the local snapshot file (with a temporary app/.data/agent.lock).
// There is no local snapshot file anymore, so this script is the agent's
// replacement write path: after explaining a photographed/pasted question,
// the agent calls this script with its own trusted Busabase credentials to
// record the question (with its child-facing explanation), the mistake
// card it produced (if the answer was wrong), and/or a practice paper plan
// — plus a review item so a parent/teacher can approve it in the app.
//
// This script never writes review decision fields (decision-action/
// decision-comment/decided-at/execution-*) even if a payload happens to
// include them — those are set only by a human through the AirApp's
// approve/request-changes/block buttons (busabase-provider.js's
// submitReview()) or by scripts/execute_decisions.mjs after a decision
// already exists. A freshly recorded review always starts at
// status "needs_review".
//
// Usage:
//   node scripts/record_homework.mjs --file payload.json           Dry run: print the planned upserts.
//   node scripts/record_homework.mjs --file payload.json --apply   Write questions/mistakes/papers/reviews to Busabase.
//   cat payload.json | node scripts/record_homework.mjs --apply    Reads stdin when --file is omitted.
//
// Payload shape (every top-level array is optional):
//   {
//     "questions": [{ "question_id": "q-1", "ref": 1, "title": "...", "explanation": {...}, ... }],
//     "mistakes": [{ "mistake_id": "m-1", "question_id": "q-1", "analysis": {...}, ... }],
//     "papers": [{ "paper_id": "p-1", "items": [...], "analysis": {...}, ... }],
//     "reviews": [{ "review_id": "rv-1", "target_type": "question", "target_id": "q-1", ... }]
//   }
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import {
  baseMistakeFields,
  basePaperFields,
  baseQuestionFields,
  baseReviewFields,
  computeMistakeFromRow,
  computePaperFromRow,
  computeQuestionFromRow,
  computeReviewFromRow,
} from "../app/app/js/homework-model.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

function help() {
  console.log(`Usage: node scripts/record_homework.mjs [--file payload.json] [--apply]

Records question/mistake/paper/review items the agent just produced while
helping with homework in chat. Reads a JSON payload (see the file header for
the shape) from --file or stdin. Without --apply this is a dry run that only
prints the planned upserts. With --apply it upserts each item into its
Busabase Base by stable id (create if missing, update if found), preserving
any existing review decision fields — this script itself never sets a
decision. It has no other external side effect: no photo is uploaded, no
paper is exported, and no school system is contacted.`);
}

const BASE_BY_KIND = { questions: "questions", mistakes: "mistakes", papers: "papers", reviews: "reviews" };
const ID_FIELD_BY_KIND = { questions: "question-id", mistakes: "mistake-id", papers: "paper-id", reviews: "review-id" };
const ID_KEY_BY_KIND = { questions: "question_id", mistakes: "mistake_id", papers: "paper_id", reviews: "review_id" };
const FIELDS_BUILDER_BY_KIND = {
  questions: baseQuestionFields,
  mistakes: baseMistakeFields,
  papers: basePaperFields,
  reviews: baseReviewFields,
};
const NORMALIZER_BY_KIND = {
  questions: computeQuestionFromRow,
  mistakes: computeMistakeFromRow,
  papers: computePaperFromRow,
  reviews: computeReviewFromRow,
};

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));
// records.get({baseId, fieldSlug, valueText}) is typed narrower than the
// records.list() shape read elsewhere (only headCommit.fields, no top-level
// fields fallback); accept it loosely here. Mirrors busabase-provider.js's
// findRecord() and kelly-pr-review's execute_decisions.mjs rawFieldsOf().
/** @param {any} record */
const rawFieldsOf = (record) => record?.headCommit?.fields || record?.fields || {};

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function loadPayload(args) {
  const fileIndex = args.indexOf("--file");
  if (fileIndex !== -1) {
    const path = args[fileIndex + 1];
    if (!path) throw new Error("--file requires a path");
    return JSON.parse(await readFile(path, "utf8"));
  }
  const text = await readStdin();
  if (!text.trim()) throw new Error("No payload provided: pass --file <path> or pipe JSON on stdin");
  return JSON.parse(text);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const apply = args.includes("--apply");

  const payload = await loadPayload(args);
  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Homework Coach Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const basesByKey = new Map(resources.bases.map((base) => [base.key, base]));

  const now = new Date().toISOString();
  const results = [];

  for (const kind of Object.keys(BASE_BY_KIND)) {
    const items = Array.isArray(payload[kind]) ? payload[kind] : [];
    if (!items.length) continue;
    const declared = basesByKey.get(BASE_BY_KIND[kind]);
    const idField = ID_FIELD_BY_KIND[kind];
    const idKey = ID_KEY_BY_KIND[kind];
    const buildFields = FIELDS_BUILDER_BY_KIND[kind];
    const normalize = NORMALIZER_BY_KIND[kind];

    for (const item of items) {
      const idValue = String(item[idKey] || "");
      if (!idValue) {
        results.push({ kind, error: `Missing ${idKey}`, item });
        continue;
      }
      let existing = null;
      try {
        existing = await client.records.get({ baseId: declared.baseId, fieldSlug: idField, valueText: idValue });
      } catch (error) {
        if (error?.code !== "NOT_FOUND" && error?.status !== 404) throw error;
      }

      // Freshly recorded reviews always start needs_review with no decision;
      // a re-sync of an existing review preserves whatever decision a human
      // already made instead of clobbering it. This script never sets
      // decision-action/decision-comment/decided-at/execution-* itself.
      const current = existing ? normalize(normalizeFields(rawFieldsOf(existing))) : {};
      const merged =
        kind === "reviews"
          ? {
              ...current,
              ...item,
              status: current.status || "needs_review",
              decision_action: current.decision_action || "",
              decision_comment: current.decision_comment || "",
              decided_at: current.decided_at || "",
              execution_status: current.execution_status || "",
              execution_detail: current.execution_detail || "",
              executed_at: current.executed_at || "",
            }
          : { ...current, ...item };
      const fields = toBusabaseFields(buildFields(merged));

      results.push({
        kind,
        id: idValue,
        action: existing ? "update" : "create",
        status: apply ? "written" : "planned",
      });
      if (!apply) continue;

      if (existing) {
        await client.records.changeRequest({
          recordId: existing.id,
          operation: "update",
          fields,
          message: `record_homework.mjs updates ${kind} ${idValue}`,
          author: "kelly-homework-coach-recorder",
          baseCommitId: existing.headCommitId,
          autoMerge: true,
        });
      } else {
        await client.bases.createChangeRequest({
          baseId: declared.baseId,
          fields,
          message: `record_homework.mjs creates ${kind} ${idValue}`,
          submittedBy: "kelly-homework-coach-recorder",
          autoMerge: true,
        });
      }
    }
  }

  console.log(JSON.stringify({ generated_at: now, dry_run: !apply, results }, null, 2));
  console.log(`${results.length} item(s) ${apply ? "written" : "planned"}.`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write these items to Busabase.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
