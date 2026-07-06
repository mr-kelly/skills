#!/usr/bin/env node
// Write-path for a completed research brief or report.
// Usage: node scripts/file_report.ts <payload.json>
// Payload: { "question_id": "...", "question": "... (optional, creates the question)",
//            "brief": { ... } }  OR  { "question_id": "...", "report": { ... } }
import fs from "node:fs/promises";
import { createProvider } from "../lib/data-provider/index.ts";

function fail(message: string): never {
  console.error(`file_report failed: ${message}`);
  process.exit(1);
}

async function readJsonFile<T = any>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

const payloadPath = process.argv[2];
if (!payloadPath) fail("usage: node scripts/file_report.ts <payload.json>");

const payload = await readJsonFile<any>(payloadPath);
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
  const sourceIds = new Set<string>();
  report.sources.forEach((source: any, index: number) => {
    for (const key of ["source_id", "title", "url"]) {
      if (typeof source[key] !== "string" || !source[key])
        fail(`report.sources[${index}].${key} must be a non-empty string`);
    }
    if (sourceIds.has(source.source_id)) fail(`report.sources[${index}].source_id duplicates ${source.source_id}`);
    sourceIds.add(source.source_id);
  });
  report.sections.forEach((section: any, index: number) => {
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

const provider = await createProvider();
try {
  const result = await provider.fileReport(payload);
  console.log(`OK: ${result.detail} (provider: ${provider.name})`);
} catch (error) {
  fail((error as Error).message);
}
