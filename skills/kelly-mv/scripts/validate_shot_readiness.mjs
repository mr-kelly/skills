#!/usr/bin/env node
// Validate that music-video storyboard shots are ready to generate/use: each
// shot needs a title, a scene description (the image prompt), and a sane
// duration. Warns when an on-screen character has no reference card
// (image-to-image consistency). Ported from the retired
// scripts/validate_shot_readiness.ts — same rules, same CLI contract — now
// reading from Busabase instead of the local project-store.
//
// Usage:
//   node scripts/validate_shot_readiness.mjs [project.json] [--strict]
import fs from "node:fs/promises";
import path from "node:path";
import { connect, parseJsonArray, readAllRecords } from "./lib/mv-busabase.mjs";

async function loadFromBusabase() {
  const { client, basesByKey } = await connect();
  const [projectRows, castRows, shotRows] = await Promise.all([
    readAllRecords(client, basesByKey.get("project")),
    readAllRecords(client, basesByKey.get("cast")),
    readAllRecords(client, basesByKey.get("shots")),
  ]);
  return {
    project_id: projectRows[0]?.project_id || "kelly-mv-project",
    characters: castRows
      .filter((row) => row.deleted !== "true")
      .map((row) => ({
        id: row.character_id,
        name: row.name,
        reference_card: { image_asset: row.reference_card_asset_id },
      })),
    shots: shotRows
      .filter((row) => row.deleted !== "true")
      .map((row) => ({
        id: row.shot_id,
        title: row.title,
        description: row.description,
        duration_seconds: row.duration_seconds,
        characters: parseJsonArray(row.characters_json),
      })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const positional = args.filter((a) => !a.startsWith("--"));
  const source = positional[0] ? path.resolve(positional[0]) : null;
  const project = source ? JSON.parse(await fs.readFile(source, "utf8")) : await loadFromBusabase();
  const label = source || `${project.project_id} (busabase)`;

  const ALLOWED_DURATIONS = [4, 5, 6, 8, 10, 12];
  const str = (v) => (typeof v === "string" ? v.trim() : v ? String(v) : "");

  const shots = project.shots || [];
  const charById = new Map((project.characters || []).map((c) => [c.id, c]));
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
      if (!c.reference_card?.image_asset) {
        warnings.push(`${id}: 角色「${c.name || cid}」无参考卡图，图生图一致性会漂移`);
      }
    }
    if (errors.length === before) ready += 1;
  }

  console.log(`分镜就绪校验：${label}`);
  console.log(`就绪 ${ready}/${shots.length}  | 错误 ${errors.length}  | 警告 ${warnings.length}\n`);
  if (errors.length) console.log(`❌ 错误：\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
  if (warnings.length) console.log(`⚠️  警告：\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`);
  if (!errors.length && !warnings.length) console.log("✅ 全部分镜就绪。");

  if (errors.length || (strict && warnings.length)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
