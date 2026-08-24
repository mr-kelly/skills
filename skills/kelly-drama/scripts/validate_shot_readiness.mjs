#!/usr/bin/env node
// Validate that storyboard shots are "video-ready": enough structured
// material (motion, audio, transitions, continuity, timed dialogue) to
// generate a final shot video without wasting generations. Run before
// image/video generation. Ported from the retired
// scripts/validate_shot_readiness.ts — same rules (js/drama-model.js's
// shotReadiness(), the single source of truth also used by the browser's
// per-shot readiness chip) — now reading from Busabase instead of the local
// project-store.
//
// Usage:
//   node scripts/validate_shot_readiness.mjs [--episode ep-001] [--strict]
//
// Exit code 1 if any shot fails a hard rule (use --strict to also fail on warnings).
import { dialogueCps, shotReadiness } from "../content/kelly-drama-app/app/js/drama-model.js";
import { connect, parseJsonArray, parseJsonObject, readAllRecords } from "./lib/drama-busabase.mjs";

function help() {
  console.log(`Usage: node scripts/validate_shot_readiness.mjs [--episode ep-001] [--strict]

Reads shots from Busabase and checks each against the video-ready
Definition of Done (references/drama-workflow.md). Exit code 1 on any error
(missing required field, bad duration, missing sound bed/dialogue SRT);
--strict also fails on warnings (overdense dialogue, characters missing
reference cards).`);
}

function toShot(row) {
  return {
    id: row.shot_id,
    episode_id: row.episode_id || "",
    title: row.title || "",
    duration_seconds: Number(row.duration_seconds) || 0,
    emotion: row.emotion || "",
    shot_size: row.shot_size || "",
    camera_movement: row.camera_movement || "",
    camera: row.camera || "",
    composition: row.composition || "",
    setting: row.setting || "",
    lighting: row.lighting || "",
    action: row.action || "",
    prompt: row.prompt || "",
    negative_prompt: row.negative_prompt || "",
    video_prompt: row.video_prompt || "",
    transition_in: row.transition_in || "",
    transition_out: row.transition_out || "",
    silent: row.silent === "true",
    audio: parseJsonObject(row.audio_json),
    srt: parseJsonArray(row.srt_json),
    continuity: parseJsonObject(row.continuity_json),
    characters: parseJsonArray(row.characters_json),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const strict = args.includes("--strict");
  const epFlagIdx = args.indexOf("--episode");
  const episodeFilter = epFlagIdx >= 0 ? args[epFlagIdx + 1] : null;

  const { client, basesByKey } = await connect();
  const [characterRows, shotRows] = await Promise.all([
    readAllRecords(client, basesByKey.get("characters")),
    readAllRecords(client, basesByKey.get("shots")),
  ]);
  const characters = characterRows
    .filter((row) => row.deleted !== "true")
    .map((row) => ({
      id: row.character_id,
      name: row.name,
      reference_card: { image_asset: row.reference_card_asset_id },
    }));
  const charIds = new Set(characters.map((c) => c.id));

  let shots = shotRows.filter((row) => row.deleted !== "true").map(toShot);
  if (episodeFilter) shots = shots.filter((s) => s.episode_id === episodeFilter);

  const errors = [];
  const warnings = [];
  const ready = [];

  for (const shot of shots) {
    const id = shot.id || "(missing id)";
    const before = errors.length;
    const r = shotReadiness(shot);
    for (const label of r.missing) errors.push(`${id}: 缺「${label}」`);
    if (r.pacingWarn)
      warnings.push(`${id}: 台词过密 ${dialogueCps(shot).toFixed(1)} 字/秒 (>8)，生视频会赶/对不上口型`);

    for (const cid of shot.characters || []) {
      if (!charIds.has(cid)) errors.push(`${id}: 未知角色 ${cid}`);
      const c = characters.find((x) => x.id === cid);
      if (c && !c.reference_card?.image_asset) {
        warnings.push(`${id}: 角色「${c.name || cid}」无参考卡图，图生图一致性会漂移`);
      }
    }

    if (errors.length === before) ready.push(r.silent ? `${id} (纯画面)` : id);
  }

  const total = shots.length;
  console.log(`分镜就绪校验：busabase${episodeFilter ? `  [${episodeFilter}]` : ""}`);
  console.log(`视频就绪 ${ready.length}/${total}  | 错误 ${errors.length}  | 警告 ${warnings.length}\n`);
  if (errors.length) console.log(`❌ 错误（必须修复）：\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
  if (warnings.length) console.log(`⚠️  警告：\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`);
  if (!errors.length && !warnings.length) console.log("✅ 全部分镜达到视频就绪标准。");

  if (errors.length || (strict && warnings.length)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
