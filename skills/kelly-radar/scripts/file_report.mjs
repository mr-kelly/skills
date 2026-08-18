#!/usr/bin/env node
// Write-path for a completed research brief or report, ported from the
// retired scripts/file_report.ts. Validates the same shape rules (a brief
// needs scope/expected_deliverable/planned_sources; a report needs
// non-empty sections and sources, and every section's source_ids must
// resolve to a declared source), creates the linked question if it does not
// exist yet, and flips the question to brief_needs_review/report_ready —
// same rules as the retired local-file version, just against Busabase
// records instead of app/.data/radar_snapshot.json.
//
// Usage: node scripts/file_report.mjs <payload.json>
// Payload: { "question_id": "...", "question": "... (optional, creates the question)",
//            "brief": { ... } }  OR  { "question_id": "...", "report": { ... } }
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL /
// BUSABASE_API_KEY / BUSABASE_SPACE_ID), never the AirApp's ambient session.
import { readFile } from "node:fs/promises";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import { appConfig } from "../app/app/js/config.js";

function help() {
  console.log(`Usage: node scripts/file_report.mjs <payload.json>

Files a research brief (payload.brief) or a cited report (payload.report)
against a question in Busabase, creating the question first if
payload.question is provided and it does not exist yet.`);
}

function fail(message) {
  console.error(`file_report: ${message}`);
  process.exit(1);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

async function readJsonFile(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function findRecord(client, declared, idFieldSlug, idValue) {
  try {
    return await client.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function upsert(client, declared, existing, fields, message, actor) {
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return client.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: actor,
      autoMerge: true,
    });
  }
  return client.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: normalized,
    message,
    author: actor,
    baseCommitId: existing.headCommitId,
    autoMerge: true,
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const payloadPath = args[0];
  if (!payloadPath) return help();

  const payload = await readJsonFile(payloadPath);
  if (!payload || typeof payload.question_id !== "string" || !payload.question_id) {
    fail("payload.question_id must be a non-empty string");
  }
  if (!payload.brief && !payload.report) fail("payload must contain a brief or a report");
  if (payload.brief && payload.report) fail("payload must contain either a brief or a report, not both");

  if (payload.brief) {
    for (const key of ["brief_id", "scope", "expected_deliverable"]) {
      if (typeof payload.brief[key] !== "string" || !payload.brief[key])
        fail(`brief.${key} must be a non-empty string`);
    }
    if (!Array.isArray(payload.brief.planned_sources) || !payload.brief.planned_sources.length) {
      fail("brief.planned_sources must be a non-empty array");
    }
  }

  if (payload.report) {
    const report = payload.report;
    for (const key of ["report_id", "title", "summary"]) {
      if (typeof report[key] !== "string" || !report[key]) fail(`report.${key} must be a non-empty string`);
    }
    if (!Array.isArray(report.sections) || !report.sections.length) fail("report.sections must be a non-empty array");
    if (!Array.isArray(report.sources) || !report.sources.length) {
      fail("report.sources must be a non-empty array (citations are required)");
    }
    const sourceIds = new Set();
    report.sources.forEach((source, index) => {
      for (const key of ["source_id", "title", "url"]) {
        if (typeof source[key] !== "string" || !source[key])
          fail(`report.sources[${index}].${key} must be a non-empty string`);
      }
      if (sourceIds.has(source.source_id)) fail(`report.sources[${index}].source_id duplicates ${source.source_id}`);
      sourceIds.add(source.source_id);
    });
    report.sections.forEach((section, index) => {
      for (const key of ["section_id", "heading", "body"]) {
        if (typeof section[key] !== "string" || !section[key])
          fail(`report.sections[${index}].${key} must be a non-empty string`);
      }
      if (!Array.isArray(section.source_ids)) fail(`report.sections[${index}].source_ids must be an array`);
      for (const sourceId of section.source_ids) {
        if (!sourceIds.has(sourceId)) fail(`report.sections[${index}] cites unknown source: ${sourceId}`);
      }
    });
  }

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Radar Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);
  const actor = "kelly-radar-file-report";
  const now = new Date().toISOString();

  const existingQuestion = await findRecord(client, declared("questions"), "question-id", payload.question_id);
  /** @type {Record<string, any>} */
  let questionFields;
  if (existingQuestion) {
    questionFields = normalizeFields(
      existingQuestion.headCommit?.payload || existingQuestion.headCommit?.fields || existingQuestion.fields,
    );
  } else {
    if (typeof payload.question !== "string" || !payload.question) {
      fail(`question ${payload.question_id} not found; include payload.question to create it`);
    }
    questionFields = {
      question_id: payload.question_id,
      question: payload.question,
      status: "brief_needs_review",
      asked_at: now,
      depth: payload.depth || "standard",
      cost_note: payload.cost_note || "",
      brief_id: "",
      report_id: "",
      confidence: "",
      followups: "[]",
    };
  }

  let detail;
  if (payload.brief) {
    const brief = payload.brief;
    const existingBrief = await findRecord(client, declared("briefs"), "brief-id", brief.brief_id);
    await upsert(
      client,
      declared("briefs"),
      existingBrief,
      {
        brief_id: brief.brief_id,
        question_id: payload.question_id,
        status: "needs_review",
        drafted_at: now,
        depth: brief.depth || questionFields.depth || "standard",
        scope: brief.scope,
        planned_sources: JSON.stringify(brief.planned_sources),
        expected_deliverable: brief.expected_deliverable,
        notes: brief.notes || "",
        decision_verdict: "",
        decision_comment: "",
        decided_at: "",
      },
      `File brief ${brief.brief_id}`,
      actor,
    );
    questionFields = {
      ...questionFields,
      question_id: payload.question_id,
      brief_id: brief.brief_id,
      status: "brief_needs_review",
    };
    detail = `Brief ${brief.brief_id} filed for '${questionFields.question}'. Awaiting approval.`;
  } else {
    const report = payload.report;
    const existingReport = await findRecord(client, declared("reports"), "report-id", report.report_id);
    const currentReport = existingReport
      ? normalizeFields(
          existingReport.headCommit?.payload || existingReport.headCommit?.fields || existingReport.fields,
        )
      : null;
    await upsert(
      client,
      declared("reports"),
      existingReport,
      {
        report_id: report.report_id,
        question_id: payload.question_id,
        title: report.title,
        filed_at: now,
        summary: report.summary,
        confidence: currentReport?.confidence ?? "",
        sections: JSON.stringify(report.sections),
        sources: JSON.stringify(report.sources),
        annotations: JSON.stringify(
          report.annotations?.length ? report.annotations : JSON.parse(currentReport?.annotations || "[]"),
        ),
        decided_at: currentReport?.decided_at || "",
      },
      `File report ${report.report_id}`,
      actor,
    );
    questionFields = {
      ...questionFields,
      question_id: payload.question_id,
      report_id: report.report_id,
      status: "report_ready",
    };
    detail = `Report ${report.report_id} filed for '${questionFields.question}' with ${report.sources.length} cited sources.`;
  }

  await upsert(
    client,
    declared("questions"),
    existingQuestion,
    questionFields,
    `File update for question ${payload.question_id}`,
    actor,
  );
  await client.bases.createChangeRequest({
    baseId: declared("sync_log").baseId,
    fields: toBusabaseFields({
      log_id: `log-${Date.now().toString(36)}`,
      at: now,
      actor: "kelly-radar-agent",
      action: "file_report",
      detail,
    }),
    message: "File report sync log",
    submittedBy: actor,
    autoMerge: true,
  });

  console.log(`OK: ${detail}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
