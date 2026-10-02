#!/usr/bin/env node
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig as supportConfig } from "../../kelly-support/content/kelly-support-app/app/js/config.js";
import { appConfig as labConfig } from "../content/kelly-local-model-lab-app/app/js/config.js";

/** @param {Record<string, any>} fields @returns {Record<string, any>} */
const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

export function contentHash(pair) {
  const canonical = JSON.stringify({
    task: "support_qa",
    article_id: String(pair.article_id || "").trim(),
    pair_id: String(pair.pair_id || "").trim(),
    question: String(pair.question || "").trim(),
    answer: String(pair.answer || "").trim(),
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function splitForSource(articleId) {
  const bucket = Number.parseInt(createHash("sha256").update(String(articleId)).digest("hex").slice(0, 8), 16) % 10;
  if (bucket < 7) return "train";
  if (bucket < 9) return "valid";
  return "test";
}

export function toTrainingExample(pair, article) {
  const pairUpdated = Date.parse(pair.updated_at || "");
  const articleUpdated = Date.parse(article.updated_at || "");
  if (Number.isFinite(articleUpdated) && (!Number.isFinite(pairUpdated) || pairUpdated < articleUpdated)) {
    return { skipped: "stale_pair" };
  }
  const question = String(pair.question || "").trim();
  const answer = String(pair.answer || "").trim();
  if (!question || !answer) return { skipped: "empty_pair" };
  const pairId = String(pair.pair_id || "").trim();
  const articleId = String(pair.article_id || "").trim();
  if (!pairId || !articleId) return { skipped: "missing_provenance" };
  return {
    example_id: `SUPPORT-${pairId}`,
    task: "support_qa",
    prompt: question,
    ideal_response: answer,
    split: splitForSource(articleId),
    status: "needs_review",
    source: `kelly-support:${articleId}:${pairId}`,
    content_hash: contentHash(pair),
    review_note: `Upstream QA approved by ${pair.reviewed_by || "unknown reviewer"}; verify for model training.`,
    reviewed_at: "",
    updated_at: new Date().toISOString(),
  };
}

export function invalidateTrainingExample(existing, status, note) {
  return {
    example_id: String(existing.example_id || ""),
    task: String(existing.task || "support_qa"),
    prompt: String(existing.prompt || ""),
    ideal_response: String(existing.ideal_response || ""),
    split: String(existing.split || "train"),
    status,
    source: String(existing.source || ""),
    content_hash: String(existing.content_hash || ""),
    review_note: note,
    reviewed_at: "",
    updated_at: new Date().toISOString(),
  };
}

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 100; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: Math.min(declared.readLimit || 50, 50),
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

function requireReady(name, resources) {
  if (!resources.folder || resources.missing.length) {
    const missing = resources.missing.map((item) => item.name).join(", ");
    throw new Error(`${name} resources are not ready${missing ? `: ${missing}` : ""}`);
  }
}

function declared(resources, key) {
  const value = resources.bases.find((base) => base.key === key);
  if (!value) throw new Error(`Missing declared Base: ${key}`);
  return value;
}

async function writeExample(client, base, existing, fields) {
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: base.baseId,
      fields: normalized,
      message: `Import approved Kelly Support QA ${fields.example_id}`,
      submittedBy: "kelly-local-model-lab-support-qa-bridge",
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.__recordId,
    operation: "update",
    fields: normalized,
    message: `Refresh Kelly Support QA ${fields.example_id}`,
    author: "kelly-local-model-lab-support-qa-bridge",
    baseCommitId: existing.__headCommitId,
    autoMerge: true,
  });
}

export async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const baseUrl = process.env.BUSABASE_BASE_URL;
  const apiKey = process.env.BUSABASE_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("BUSABASE_BASE_URL and BUSABASE_API_KEY are required");
  const client = createBusabaseClient({
    baseUrl,
    apiKey,
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });
  const [supportResources, labResources] = await Promise.all([
    inspectProvisionedResources(client, supportConfig),
    inspectProvisionedResources(client, labConfig),
  ]);
  requireReady("Kelly Support", supportResources);
  requireReady("Kelly Local Model Lab", labResources);

  const qaBase = declared(supportResources, "qa-pairs");
  const kbBase = declared(supportResources, "knowledge-base");
  const examplesBase = declared(labResources, "training-examples");
  const [pairs, articles, existingExamples] = await Promise.all([
    readAll(client, qaBase),
    readAll(client, kbBase),
    readAll(client, examplesBase),
  ]);
  const articleById = new Map(articles.map((article) => [article.article_id, article]));
  const existingById = new Map(existingExamples.map((example) => [example.example_id, example]));
  const summary = { approved: 0, create: 0, update: 0, invalidated: 0, unchanged: 0, stale: 0, invalid: 0 };
  const planned = [];
  const seenExampleIds = new Set();

  for (const pair of pairs) {
    const expectedExampleId = `SUPPORT-${String(pair.pair_id || "").trim()}`;
    if (expectedExampleId === "SUPPORT-") {
      summary.invalid += 1;
      continue;
    }
    seenExampleIds.add(expectedExampleId);
    const existing = existingById.get(expectedExampleId);
    if (pair.status !== "approved") {
      if (existing && existing.status !== "blocked") {
        planned.push({
          example: invalidateTrainingExample(
            existing,
            "blocked",
            `Upstream Kelly Support QA is ${pair.status || "not approved"}; excluded from future snapshots.`,
          ),
          existing,
        });
        summary.invalidated += 1;
      }
      continue;
    }
    summary.approved += 1;
    const article = articleById.get(pair.article_id);
    if (!article) {
      if (existing && existing.status !== "blocked") {
        planned.push({
          example: invalidateTrainingExample(
            existing,
            "blocked",
            "The upstream source article is missing; provenance can no longer be verified.",
          ),
          existing,
        });
        summary.invalidated += 1;
      }
      summary.invalid += 1;
      continue;
    }
    const example = toTrainingExample(pair, article);
    if (example.skipped === "stale_pair") {
      if (existing && existing.status !== "changes_requested") {
        planned.push({
          example: invalidateTrainingExample(
            existing,
            "changes_requested",
            "The source article is newer than this QA pair; re-distill and re-approve it before training.",
          ),
          existing,
        });
        summary.invalidated += 1;
      }
      summary.stale += 1;
      continue;
    }
    if (example.skipped) {
      summary.invalid += 1;
      continue;
    }
    if (existing?.content_hash === example.content_hash) {
      summary.unchanged += 1;
      continue;
    }
    summary[existing ? "update" : "create"] += 1;
    planned.push({ example, existing });
  }

  for (const existing of existingExamples) {
    if (!String(existing.source || "").startsWith("kelly-support:")) continue;
    if (seenExampleIds.has(existing.example_id) || existing.status === "blocked") continue;
    planned.push({
      example: invalidateTrainingExample(
        existing,
        "blocked",
        "The upstream Kelly Support QA pair no longer exists; excluded from future snapshots.",
      ),
      existing,
    });
    summary.invalidated += 1;
  }

  console.log(apply ? "Apply mode" : "Dry run; no records will be written");
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    `Distinct source articles ready: ${new Set(planned.map(({ example }) => example.source.split(":")[1])).size}`,
  );
  if (!apply) {
    for (const { example, existing } of planned) {
      console.log(`${existing ? "UPDATE" : "CREATE"} ${example.example_id} -> ${example.split}`);
    }
    return summary;
  }
  for (const { example, existing } of planned) await writeExample(client, examplesBase, existing, example);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
