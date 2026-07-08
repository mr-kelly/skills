#!/usr/bin/env node
// Validates a radar snapshot against references/radar-schema.md.
// Usage: node scripts/validate_ui_schema.ts [snapshot.json]
import fs from "node:fs/promises";

const target = process.argv[2] || new URL("../app/.data/radar_snapshot.json", import.meta.url).pathname;

const SOURCE_KINDS = ["pricing", "changelog", "landing", "launch", "reviews", "news", "hiring", "community"];
const SEVERITIES = ["high", "medium", "low"];
const SIGNAL_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];
const TARGET_TYPES = ["competitor", "category", "keyword", "community"];
const TARGET_STATUSES = ["ok", "warning", "stale", "paused"];
const QUESTION_STATUSES = ["brief_needs_review", "researching", "report_ready", "annotated", "closed"];
const BRIEF_STATUSES = ["needs_review", "approved", "changes_requested", "blocked"];
const MOVER_SOURCES = ["search", "community", "category"];
const OPPORTUNITY_STATUSES = ["needs_review", "approved", "done", "blocked"];
const DEPTHS = ["quick", "standard", "deep"];

type JsonObject = Record<string, any>;

function fail(message: string): never {
  console.error(`Schema validation failed: ${message}`);
  process.exit(1);
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(obj: JsonObject, key: string, path: string): void {
  if (typeof obj[key] !== "string" || obj[key].length === 0) fail(`${path}.${key} must be a non-empty string`);
}

function requireNumber(obj: JsonObject, key: string, path: string): void {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) fail(`${path}.${key} must be a number`);
}

function requireEnum(obj: JsonObject, key: string, values: string[], path: string): void {
  if (!values.includes(obj[key]))
    fail(`${path}.${key} must be one of ${values.join("|")}, got ${JSON.stringify(obj[key])}`);
}

const raw = await fs.readFile(target, "utf8").catch((error: Error) => {
  fail(`cannot read ${target}: ${error.message}`);
});

let snapshot: JsonObject;
try {
  snapshot = JSON.parse(raw);
} catch (error) {
  fail(`invalid JSON: ${(error as Error).message}`);
}

if (!isObject(snapshot)) fail("root must be an object");
requireString(snapshot, "schema_version", "root");
requireString(snapshot, "generated_at", "root");
requireString(snapshot, "source", "root");
if (!isObject(snapshot.metrics)) fail("root.metrics must be an object");
for (const key of [
  "watch_target_count",
  "signal_count",
  "signals_needs_review",
  "questions_open",
  "briefs_needs_review",
  "reports_ready",
  "trend_mover_count",
  "opportunities_open",
]) {
  requireNumber(snapshot.metrics, key, "root.metrics");
}
if (!Array.isArray(snapshot.watchlist)) fail("root.watchlist must be an array");
if (!Array.isArray(snapshot.signals)) fail("root.signals must be an array");
if (!isObject(snapshot.research)) fail("root.research must be an object");
if (!Array.isArray(snapshot.research.questions)) fail("root.research.questions must be an array");
if (!Array.isArray(snapshot.research.briefs)) fail("root.research.briefs must be an array");
if (!Array.isArray(snapshot.research.reports)) fail("root.research.reports must be an array");
if (!isObject(snapshot.trends)) fail("root.trends must be an object");
if (!Array.isArray(snapshot.trends.movers)) fail("root.trends.movers must be an array");
if (!Array.isArray(snapshot.trends.opportunities)) fail("root.trends.opportunities must be an array");
if (!Array.isArray(snapshot.sync_log)) fail("root.sync_log must be an array");

const targetIds = new Set();
const sourceIdsByTarget = new Map();
snapshot.watchlist.forEach((entry, index) => {
  const path = `root.watchlist[${index}]`;
  if (!isObject(entry)) fail(`${path} must be an object`);
  for (const key of ["target_id", "name"]) requireString(entry, key, path);
  requireEnum(entry, "type", TARGET_TYPES, path);
  requireEnum(entry, "status", TARGET_STATUSES, path);
  if (targetIds.has(entry.target_id)) fail(`${path}.target_id duplicates ${entry.target_id}`);
  targetIds.add(entry.target_id);
  if (!Array.isArray(entry.sources)) fail(`${path}.sources must be an array`);
  const sourceIds = new Set();
  entry.sources.forEach((source, sourceIndex) => {
    const sourcePath = `${path}.sources[${sourceIndex}]`;
    requireString(source, "source_id", sourcePath);
    requireEnum(source, "kind", SOURCE_KINDS, sourcePath);
    requireEnum(source, "method", ["browser_agent", "manual"], sourcePath);
    if (sourceIds.has(source.source_id)) fail(`${sourcePath}.source_id duplicates ${source.source_id}`);
    sourceIds.add(source.source_id);
  });
  sourceIdsByTarget.set(entry.target_id, sourceIds);
});

const signalIds = new Set();
snapshot.signals.forEach((signal, index) => {
  const path = `root.signals[${index}]`;
  if (!isObject(signal)) fail(`${path} must be an object`);
  for (const key of ["signal_id", "target_id", "source_id", "headline", "summary", "detected_at", "content_hash"]) {
    requireString(signal, key, path);
  }
  requireEnum(signal, "source_kind", SOURCE_KINDS, path);
  requireEnum(signal, "severity", SEVERITIES, path);
  requireEnum(signal, "status", SIGNAL_STATUSES, path);
  if (signalIds.has(signal.signal_id)) fail(`${path}.signal_id duplicates ${signal.signal_id}`);
  signalIds.add(signal.signal_id);
  if (!targetIds.has(signal.target_id)) fail(`${path}.target_id does not match a watch target: ${signal.target_id}`);
  if (!Array.isArray(signal.evidence)) fail(`${path}.evidence must be an array`);
  signal.evidence.forEach((entry, evidenceIndex) => {
    requireString(entry, "title", `${path}.evidence[${evidenceIndex}]`);
    requireString(entry, "url", `${path}.evidence[${evidenceIndex}]`);
  });
  if (signal.diff !== undefined) {
    if (!isObject(signal.diff) || !Array.isArray(signal.diff.lines)) fail(`${path}.diff.lines must be an array`);
    signal.diff.lines.forEach((line, lineIndex) => {
      requireEnum(line, "type", ["context", "added", "removed"], `${path}.diff.lines[${lineIndex}]`);
      requireString(line, "text", `${path}.diff.lines[${lineIndex}]`);
    });
  }
});

const briefIds = new Set();
snapshot.research.briefs.forEach((brief, index) => {
  const path = `root.research.briefs[${index}]`;
  for (const key of ["brief_id", "question_id", "scope"]) requireString(brief, key, path);
  requireEnum(brief, "status", BRIEF_STATUSES, path);
  requireEnum(brief, "depth", DEPTHS, path);
  if (!Array.isArray(brief.planned_sources)) fail(`${path}.planned_sources must be an array`);
  if (briefIds.has(brief.brief_id)) fail(`${path}.brief_id duplicates ${brief.brief_id}`);
  briefIds.add(brief.brief_id);
});

const reportIds = new Set();
snapshot.research.reports.forEach((report, index) => {
  const path = `root.research.reports[${index}]`;
  for (const key of ["report_id", "question_id", "title", "summary", "filed_at"]) requireString(report, key, path);
  if (reportIds.has(report.report_id)) fail(`${path}.report_id duplicates ${report.report_id}`);
  reportIds.add(report.report_id);
  if (!Array.isArray(report.sections) || !report.sections.length) fail(`${path}.sections must be a non-empty array`);
  if (!Array.isArray(report.sources) || !report.sources.length) fail(`${path}.sources must be a non-empty array`);
  if (!Array.isArray(report.annotations)) fail(`${path}.annotations must be an array`);
  const sourceIds = new Set();
  report.sources.forEach((source, sourceIndex) => {
    const sourcePath = `${path}.sources[${sourceIndex}]`;
    for (const key of ["source_id", "title", "url"]) requireString(source, key, sourcePath);
    if (sourceIds.has(source.source_id)) fail(`${sourcePath}.source_id duplicates ${source.source_id}`);
    sourceIds.add(source.source_id);
  });
  report.sections.forEach((section, sectionIndex) => {
    const sectionPath = `${path}.sections[${sectionIndex}]`;
    for (const key of ["section_id", "heading", "body"]) requireString(section, key, sectionPath);
    if (!Array.isArray(section.source_ids)) fail(`${sectionPath}.source_ids must be an array`);
    for (const sourceId of section.source_ids) {
      if (!sourceIds.has(sourceId)) fail(`${sectionPath} cites unknown source: ${sourceId}`);
    }
  });
});

const questionIds = new Set();
snapshot.research.questions.forEach((question, index) => {
  const path = `root.research.questions[${index}]`;
  for (const key of ["question_id", "question", "asked_at"]) requireString(question, key, path);
  requireEnum(question, "status", QUESTION_STATUSES, path);
  requireEnum(question, "depth", DEPTHS, path);
  if (questionIds.has(question.question_id)) fail(`${path}.question_id duplicates ${question.question_id}`);
  questionIds.add(question.question_id);
  if (question.brief_id && !briefIds.has(question.brief_id))
    fail(`${path}.brief_id does not match a brief: ${question.brief_id}`);
  if (question.report_id && !reportIds.has(question.report_id))
    fail(`${path}.report_id does not match a report: ${question.report_id}`);
  if (!Array.isArray(question.followups)) fail(`${path}.followups must be an array`);
});

const moverIds = new Set();
const moverKeys = new Set();
snapshot.trends.movers.forEach((mover, index) => {
  const path = `root.trends.movers[${index}]`;
  for (const key of ["mover_id", "keyword"]) requireString(mover, key, path);
  requireEnum(mover, "source", MOVER_SOURCES, path);
  requireNumber(mover, "volume_proxy", path);
  requireNumber(mover, "delta_pct", path);
  if (!Array.isArray(mover.momentum) || mover.momentum.some((value) => typeof value !== "number")) {
    fail(`${path}.momentum must be an array of numbers`);
  }
  if (moverIds.has(mover.mover_id)) fail(`${path}.mover_id duplicates ${mover.mover_id}`);
  moverIds.add(mover.mover_id);
  const key = `${mover.keyword.toLowerCase()}::${mover.source}`;
  if (moverKeys.has(key)) fail(`${path} duplicates keyword+source: ${key}`);
  moverKeys.add(key);
});

const opportunityIds = new Set();
snapshot.trends.opportunities.forEach((opportunity, index) => {
  const path = `root.trends.opportunities[${index}]`;
  for (const key of ["opportunity_id", "title", "rationale"]) requireString(opportunity, key, path);
  requireEnum(opportunity, "status", OPPORTUNITY_STATUSES, path);
  if (opportunityIds.has(opportunity.opportunity_id))
    fail(`${path}.opportunity_id duplicates ${opportunity.opportunity_id}`);
  opportunityIds.add(opportunity.opportunity_id);
  if (!isObject(opportunity.proposed_next_step)) fail(`${path}.proposed_next_step must be an object`);
  requireString(opportunity.proposed_next_step, "operation", `${path}.proposed_next_step`);
  if (!Array.isArray(opportunity.mover_ids)) fail(`${path}.mover_ids must be an array`);
  for (const moverId of opportunity.mover_ids) {
    if (!moverIds.has(moverId)) fail(`${path}.mover_ids references unknown mover: ${moverId}`);
  }
});

snapshot.trends.movers.forEach((mover, index) => {
  if (mover.opportunity_id && !opportunityIds.has(mover.opportunity_id)) {
    fail(`root.trends.movers[${index}].opportunity_id does not match an opportunity: ${mover.opportunity_id}`);
  }
});

console.log(`OK: ${target}`);
