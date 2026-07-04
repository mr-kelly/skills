#!/usr/bin/env node
// Write-path for a completed research brief or report.
// Usage: node scripts/file_report.mjs <payload.json>
// Payload: { "question_id": "...", "question": "... (optional, creates the question)",
//            "brief": { ... } }  OR  { "question_id": "...", "report": { ... } }
import { SNAPSHOT_PATH } from "../app/server/paths.mjs";
import { acquireLock, emptySnapshot, readJson, releaseLock, writeJson } from "../app/server/store.mjs";

function fail(message) {
  console.error(`file_report failed: ${message}`);
  process.exit(1);
}

const payloadPath = process.argv[2];
if (!payloadPath) fail("usage: node scripts/file_report.mjs <payload.json>");

const payload = await readJson(payloadPath, null);
if (!payload || typeof payload.question_id !== "string" || !payload.question_id)
  fail("payload.question_id must be a non-empty string");
if (!payload.brief && !payload.report) fail("payload must contain a brief or a report");
if (payload.brief && payload.report) fail("payload must contain either a brief or a report, not both");

if (payload.brief) {
  for (const key of ["brief_id", "scope", "expected_deliverable"]) {
    if (typeof payload.brief[key] !== "string" || !payload.brief[key]) fail(`brief.${key} must be a non-empty string`);
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
  if (!Array.isArray(report.sources) || !report.sources.length)
    fail("report.sources must be a non-empty array (citations are required)");
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

const now = new Date().toISOString();
await acquireLock("kelly-radar/file_report", `Filing ${payload.brief ? "brief" : "report"} for ${payload.question_id}`);
try {
  const snapshot = (await readJson(SNAPSHOT_PATH, null)) || emptySnapshot();
  snapshot.research = snapshot.research || { questions: [], briefs: [], reports: [] };
  const { questions, briefs, reports } = snapshot.research;

  let question = questions.find((entry) => entry.question_id === payload.question_id);
  if (!question) {
    if (typeof payload.question !== "string" || !payload.question) {
      fail(`question ${payload.question_id} not found; include payload.question to create it`);
    }
    question = {
      question_id: payload.question_id,
      question: payload.question,
      status: "brief_needs_review",
      asked_at: now,
      depth: payload.depth || "standard",
      cost_note: payload.cost_note || "",
      brief_id: "",
      report_id: "",
      confidence: null,
      followups: [],
    };
    questions.push(question);
  }

  let detail = "";
  if (payload.brief) {
    const brief = {
      status: "needs_review",
      drafted_at: now,
      depth: question.depth || "standard",
      notes: "",
      ...payload.brief,
      question_id: payload.question_id,
    };
    const index = briefs.findIndex((entry) => entry.brief_id === brief.brief_id);
    if (index >= 0) briefs[index] = brief;
    else briefs.push(brief);
    question.brief_id = brief.brief_id;
    question.status = "brief_needs_review";
    detail = `Brief ${brief.brief_id} filed for '${question.question}'. Awaiting approval.`;
  } else {
    const report = {
      filed_at: now,
      confidence: null,
      annotations: [],
      ...payload.report,
      question_id: payload.question_id,
    };
    const index = reports.findIndex((entry) => entry.report_id === report.report_id);
    if (index >= 0)
      reports[index] = {
        ...report,
        annotations: reports[index].annotations?.length ? reports[index].annotations : report.annotations,
      };
    else reports.push(report);
    question.report_id = report.report_id;
    question.status = "report_ready";
    detail = `Report ${report.report_id} filed for '${question.question}' with ${report.sources.length} cited sources.`;
  }

  snapshot.generated_at = now;
  snapshot.source = "kelly-radar";
  snapshot.metrics = {
    ...snapshot.metrics,
    questions_open: questions.filter((entry) => entry.status !== "closed").length,
    briefs_needs_review: briefs.filter((entry) => entry.status === "needs_review").length,
    reports_ready: questions.filter((entry) => entry.status === "report_ready").length,
  };
  snapshot.sync_log = snapshot.sync_log || [];
  snapshot.sync_log.unshift({ at: now, actor: "kelly-radar-agent", action: "file_report", detail });
  snapshot.sync_log = snapshot.sync_log.slice(0, 50);

  await writeJson(SNAPSHOT_PATH, snapshot);
  console.log(`OK: ${detail}`);
} finally {
  await releaseLock();
}
