#!/usr/bin/env node
// Regroups the `## Skills` table in README.md and docs/README-zh-CN.md into one sub-table per
// category, using each SKILL.md's `metadata.category`. Row text is preserved verbatim — this
// only decides which section a row lands in and in what order, so the taxonomy stays the single
// source of truth instead of the READMEs drifting into a second one.
//
// Run after adding a skill or changing a category:  node scripts/sync-readme-skills.mjs
// `node scripts/build-site.mjs` fails when the READMEs are stale.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS, listSkillDirs, readSkillMeta } from "./lib/skill-taxonomy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const README_TARGETS = [
  { file: path.join(ROOT, "README.md"), lang: "en", header: "| Skill | What It Does | When To Use It | Details |" },
  { file: path.join(ROOT, "docs", "README-zh-CN.md"), lang: "zh", header: "| Skill | 做什么 | 什么时候用 | 详情 |" },
];

const ROW_RE = /^\| `([a-z0-9-]+)` \|.*\|$/;

/**
 * Splits a README into [before, skillsTableBlock, after] around the `## Skills` table.
 *
 * The block is anchored inside the `## Skills` section and spans from its first `### ` subheading
 * or table line through the last table line — so re-running over already-grouped output replaces
 * the same span instead of nesting another copy of the first subheading inside it.
 */
function locateTable(md, header) {
  const sectionStart = md.indexOf("\n## Skills\n");
  if (sectionStart === -1) throw new Error("`## Skills` section not found");
  const nextSection = md.indexOf("\n## ", sectionStart + 1);
  const sectionEnd = nextSection === -1 ? md.length : nextSection;
  if (!md.slice(sectionStart, sectionEnd).includes(header)) throw new Error(`skills table header not found: ${header}`);

  const lines = md.slice(0, sectionEnd).split("\n");
  const sectionFirstLine = md.slice(0, sectionStart + 1).split("\n").length - 1;

  let first = -1;
  let last = -1;
  for (let i = sectionFirstLine; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("|") || l.startsWith("### ")) {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1) throw new Error("no skills table rows found under `## Skills`");

  const before = lines.slice(0, first).join("\n");
  const block = lines.slice(first, last + 1).join("\n");
  return [`${before}\n`, block, md.slice(before.length + 1 + block.length)];
}

export async function expectedBlock(target) {
  const dirs = await listSkillDirs(ROOT);
  const metas = new Map();
  for (const d of dirs) metas.set(d, await readSkillMeta(ROOT, d));

  const raw = await fs.readFile(target.file, "utf8");
  const [, block] = locateTable(raw, target.header);

  const rows = new Map();
  for (const line of block.split("\n")) {
    const m = line.match(ROW_RE);
    if (m) rows.set(m[1], line);
  }

  const missing = dirs.filter((d) => !rows.has(d));
  if (missing.length) throw new Error(`${path.basename(target.file)}: no table row for ${missing.join(", ")}`);

  const divider = "| --- | --- | --- | --- |";
  const out = [];
  for (const g of GROUPS) {
    const members = dirs.filter((d) => metas.get(d)?.category === g.id);
    if (!members.length) continue;
    out.push(`### ${target.lang === "zh" ? g.zh : g.en}`, "", target.header, divider);
    for (const n of members) out.push(rows.get(n));
    out.push("");
  }
  return out.join("\n").replace(/\n+$/, "");
}

async function main() {
  let changed = 0;
  for (const target of README_TARGETS) {
    const raw = await fs.readFile(target.file, "utf8");
    const [before, block, after] = locateTable(raw, target.header);
    const want = await expectedBlock(target);
    if (block === want) continue;
    await fs.writeFile(target.file, before + want + after, "utf8");
    changed++;
    console.log(`${path.relative(ROOT, target.file)} regrouped`);
  }
  if (!changed) console.log("READMEs already in sync");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
