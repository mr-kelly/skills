#!/usr/bin/env node
// Trusted export step. Kelly Lesson's AirApp only ever writes a review
// decision onto a plan record — the browser cannot write to the local
// filesystem. This script re-reads Busabase for approved plans and exports
// each as a clean Markdown document. planMarkdown()/listBlock()/slugify() are
// ported verbatim (same headings, same table shape, same footer) from the
// retired scripts/export_plans.ts; only the read source changed, from a
// persisted app/.data/lesson_snapshot.json to Busabase's teachers/plans
// Bases. DOCX or PDF conversion is delegated to the agent's document skills
// per SKILL.md — this script produces Markdown only and has no other
// external effects (it never writes back to Busabase).
//
// Usage: node scripts/export_plans.mjs [--out /path/to/dir]
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { appConfig } from "../app/app/js/config.js";
import { inspectProvisionedResources } from "../app/app/js/resource-provisioning.js";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/export_plans.mjs [--out /path/to/dir]

Reads plans with status "approved" or "done" from Busabase and writes one
Markdown file per plan into --out (default: <skill>/exports, gitignored).
Read-only against Busabase — no state is written back.`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));

function parseJsonValue(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

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
      rows.push(normalizeFields(record.headCommit?.fields || record.fields));
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

// ---- Ported verbatim from the retired scripts/export_plans.ts ----

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "plan"
  );
}

function listBlock(values) {
  return (values || []).map((value) => `- ${value}`).join("\n");
}

function planMarkdown(plan, teacher, schoolName) {
  const lines = [];
  lines.push(`# ${plan.title}`);
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push(`| School | ${schoolName || ""} |`);
  lines.push(`| Subject | ${plan.subject} |`);
  lines.push(`| Grade | ${plan.grade} |`);
  lines.push(`| Unit | ${plan.unit || ""} |`);
  lines.push(`| Teacher | ${teacher?.name || plan.teacher_id} |`);
  lines.push(`| Class length | ${plan.class_length_minutes || 45} min |`);
  lines.push(`| Compliance score | ${plan.compliance_score} |`);
  lines.push("");
  if (plan.objectives.length) lines.push("## Learning Objectives", "", listBlock(plan.objectives), "");
  if (plan.key_points.length) lines.push("## Key Points", "", listBlock(plan.key_points), "");
  if (plan.difficulties.length) lines.push("## Difficulties", "", listBlock(plan.difficulties), "");
  if (plan.materials.length) lines.push("## Materials & Preparation", "", listBlock(plan.materials), "");
  if (plan.stages.length) {
    lines.push("## Lesson Flow", "");
    lines.push("| Stage | Minutes | Activities |");
    lines.push("| --- | ---: | --- |");
    for (const stage of plan.stages) {
      lines.push(`| ${stage.name} | ${Number(stage.minutes || 0)} | ${stage.activities || ""} |`);
    }
    lines.push("");
  }
  if (plan.board_plan) lines.push("## Board Plan", "", plan.board_plan, "");
  if (plan.homework) lines.push("## Homework", "", plan.homework, "");
  if (plan.safety_notes) lines.push("## Safety Notes", "", plan.safety_notes, "");
  if (plan.reflection) lines.push("## Teaching Reflection", "", plan.reflection, "");
  if (plan.curriculum_refs.length) lines.push("## Curriculum Standard Refs", "", listBlock(plan.curriculum_refs), "");
  lines.push(
    "---",
    "",
    `Exported by kelly-lesson on ${new Date().toISOString()} (Plan #${plan.ref}, ${plan.plan_id}).`,
    "",
  );
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const outIndex = args.indexOf("--out");
  const outDir =
    outIndex !== -1 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : path.join(skillDir, "exports");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly Lesson Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const declared = (key) => resources.bases.find((base) => base.key === key);

  const [plans, teachers, settingsRows] = await Promise.all([
    readAll(client, declared("plans")),
    readAll(client, declared("teachers")),
    readAll(client, declared("settings")),
  ]);
  if (!plans.length) {
    console.log("No plans found. Nothing to export.");
    return;
  }
  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const schoolName = settings.school_name || "";
  const teachersById = new Map(teachers.map((row) => [row.teacher_id, row]));

  const approved = plans.filter((row) => ["approved", "done"].includes(row.status));
  if (!approved.length) {
    console.log("No approved plans to export.");
    return;
  }

  await fs.mkdir(outDir, { recursive: true });
  for (const row of approved) {
    const plan = {
      plan_id: row.plan_id,
      ref: Number(row.ref) || 0,
      title: row.title,
      subject: row.subject,
      grade: row.grade,
      unit: row.unit,
      teacher_id: row.teacher_id,
      class_length_minutes: Number(row.class_length_minutes) || 45,
      compliance_score: Number(row.compliance_score) || 0,
      objectives: parseJsonValue(row.objectives, []),
      key_points: parseJsonValue(row.key_points, []),
      difficulties: parseJsonValue(row.difficulties, []),
      materials: parseJsonValue(row.materials, []),
      curriculum_refs: parseJsonValue(row.curriculum_refs, []),
      stages: parseJsonValue(row.stages, []),
      board_plan: row.board_plan || "",
      homework: row.homework || "",
      safety_notes: row.safety_notes || "",
      reflection: row.reflection || "",
    };
    const teacher = teachersById.get(plan.teacher_id);
    const fileName = `${slugify(`${plan.grade}-${plan.subject}-${plan.title}`)}.md`;
    const filePath = path.join(outDir, fileName);
    await fs.writeFile(filePath, planMarkdown(plan, teacher, schoolName));
    console.log(`Exported Plan #${plan.ref} -> ${filePath}`);
  }
  console.log(`Done: ${approved.length} plan(s) exported to ${outDir}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
