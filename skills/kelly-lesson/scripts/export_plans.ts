#!/usr/bin/env node
// Exports approved lesson plans as clean Markdown documents. Reads the
// snapshot plus decisions.json (a fresh "approve" decision counts), writes one
// .md file per plan into --out (default: <skill>/exports, gitignored).
// DOCX or PDF conversion is delegated to the agent's document skills per
// SKILL.md — this script produces Markdown only and has no external effects.
//
// Usage: node scripts/export_plans.ts [--out /path/to/dir]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider } from "../lib/data-provider/index.ts";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outDir = outFlag !== -1 && args[outFlag + 1] ? path.resolve(args[outFlag + 1]) : path.join(skillDir, "exports");

const provider = await createProvider();

const snapshot = await provider.readSnapshot();
if (!snapshot || !(snapshot.plans || []).length) {
  console.error("No snapshot plans found. Nothing to export.");
  process.exit(1);
}
const decisions = (await provider.readDecisions()).decisions || {};

function effectiveStatus(plan) {
  const item = (snapshot.review_items || []).find((entry) => entry.plan_id === plan.plan_id);
  const decision = item ? decisions[item.review_id] : null;
  if (decision?.action === "approve") return "approved";
  if (decision?.action === "block") return "blocked";
  if (decision?.action === "request_changes") return "changes_requested";
  return plan.status;
}

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

function planMarkdown(plan, teacher) {
  const sections = plan.sections || {};
  const lines = [];
  lines.push(`# ${plan.title}`);
  lines.push("");
  lines.push("| | |");
  lines.push("| --- | --- |");
  lines.push(`| School | ${snapshot.school?.name || ""} |`);
  lines.push(`| Subject | ${plan.subject} |`);
  lines.push(`| Grade | ${plan.grade} |`);
  lines.push(`| Unit | ${plan.unit || ""} |`);
  lines.push(`| Teacher | ${teacher?.name || plan.teacher_id} |`);
  lines.push(`| Class length | ${plan.class_length_minutes || 45} min |`);
  lines.push(`| Compliance score | ${plan.compliance_score} |`);
  lines.push("");
  if (sections.objectives?.length) {
    lines.push("## Learning Objectives", "", listBlock(sections.objectives), "");
  }
  if (sections.key_points?.length) {
    lines.push("## Key Points", "", listBlock(sections.key_points), "");
  }
  if (sections.difficulties?.length) {
    lines.push("## Difficulties", "", listBlock(sections.difficulties), "");
  }
  if (sections.materials?.length) {
    lines.push("## Materials & Preparation", "", listBlock(sections.materials), "");
  }
  if (sections.stages?.length) {
    lines.push("## Lesson Flow", "");
    lines.push("| Stage | Minutes | Activities |");
    lines.push("| --- | ---: | --- |");
    for (const stage of sections.stages) {
      lines.push(`| ${stage.name} | ${Number(stage.minutes || 0)} | ${stage.activities || ""} |`);
    }
    lines.push("");
  }
  if (sections.board_plan) lines.push("## Board Plan", "", sections.board_plan, "");
  if (sections.homework) lines.push("## Homework", "", sections.homework, "");
  if (sections.safety_notes) lines.push("## Safety Notes", "", sections.safety_notes, "");
  if (sections.reflection) lines.push("## Teaching Reflection", "", sections.reflection, "");
  if (sections.curriculum_refs?.length) {
    lines.push("## Curriculum Standard Refs", "", listBlock(sections.curriculum_refs), "");
  }
  lines.push(
    "---",
    "",
    `Exported by kelly-lesson on ${new Date().toISOString()} (Plan #${plan.ref}, ${plan.plan_id}).`,
    "",
  );
  return lines.join("\n");
}

const approved = (snapshot.plans || []).filter((plan) => ["approved", "done"].includes(effectiveStatus(plan)));
if (!approved.length) {
  console.log("No approved plans to export.");
  process.exit(0);
}

await fs.mkdir(outDir, { recursive: true });
for (const plan of approved) {
  const teacher = (snapshot.teachers || []).find((entry) => entry.teacher_id === plan.teacher_id);
  const fileName = `${slugify(`${plan.grade}-${plan.subject}-${plan.title}`)}.md`;
  const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, planMarkdown(plan, teacher));
  console.log(`Exported Plan #${plan.ref} -> ${filePath}`);
}
console.log(`Done: ${approved.length} plan(s) exported to ${outDir}.`);
