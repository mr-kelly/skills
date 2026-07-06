#!/usr/bin/env node
// Validate that music-video storyboard shots are ready to generate/use: each shot
// needs a title, a scene description (the image prompt), and a sane duration. Warns
// when an on-screen character has no reference card (image-to-image consistency).
//
// Usage:
//   node scripts/validate_shot_readiness.mjs [project.json] [--strict]

import fs from "node:fs/promises";
import path from "node:path";
import { createProvider } from "../lib/data-provider/index.ts";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const positional = args.filter((a) => !a.startsWith("--"));
// With an explicit path, read that file directly; otherwise load from the provider.
const SOURCE = positional[0] ? path.resolve(positional[0]) : null;
const project = SOURCE ? JSON.parse(await fs.readFile(SOURCE, "utf8")) : await (await createProvider()).loadProject();
const LABEL = SOURCE || `${project.project_id} (provider store)`;

const ALLOWED_DURATIONS = [4, 5, 6, 8, 10, 12];
const str = (v) => (typeof v === "string" ? v.trim() : v ? String(v) : "");

const shots = project.shots || [];
const charById = new Map<string, any>((project.characters || []).map((c) => [c.id, c]));
const errors = [];
const warnings = [];
let ready = 0;

for (const shot of shots) {
  const id = shot.id || "(missing id)";
  const before = errors.length;
  if (!str(shot.title)) errors.push(`${id}: 缺标题`);
  if (!str(shot.description)) errors.push(`${id}: 缺画面描述`);
  if (!ALLOWED_DURATIONS.includes(Number(shot.duration_seconds))) {
    errors.push(`${id}: 时长 ${shot.duration_seconds ?? "?"}s 不在允许集合 {${ALLOWED_DURATIONS.join("/")}}`);
  }
  for (const cid of shot.characters || []) {
    const c = charById.get(cid);
    if (!c) {
      errors.push(`${id}: 未知角色 ${cid}`);
      continue;
    }
    if (!c.reference_card?.image_asset?.startsWith("/generated/")) {
      warnings.push(`${id}: 角色「${c.name || cid}」无参考卡图，图生图一致性会漂移`);
    }
  }
  if (errors.length === before) ready += 1;
}

console.log(`分镜就绪校验：${LABEL}`);
console.log(`就绪 ${ready}/${shots.length}  | 错误 ${errors.length}  | 警告 ${warnings.length}\n`);
if (errors.length) console.log(`❌ 错误：\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
if (warnings.length) console.log(`⚠️  警告：\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`);
if (!errors.length && !warnings.length) console.log("✅ 全部分镜就绪。");

if (errors.length || (strict && warnings.length)) process.exit(1);
