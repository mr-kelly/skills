#!/usr/bin/env node
// Validate that storyboard shots are "video-ready": enough structured material
// (motion, audio, transitions, continuity, timed dialogue) to generate a final
// shot video without wasting generations. Run before image/video generation.
//
// Usage:
//   node scripts/validate_shot_readiness.mjs [project.json] [--episode ep-001] [--strict]
//
// Exit code 1 if any shot fails a hard rule (use --strict to also fail on warnings).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const epFlagIdx = args.indexOf("--episode");
const episodeFilter = epFlagIdx >= 0 ? args[epFlagIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith("--") && !(epFlagIdx >= 0 && i === epFlagIdx + 1));
const PROJECT = positional[0] ? path.resolve(positional[0]) : path.join(SKILL_DIR, "app", ".data", "project.json");

const ALLOWED_DURATIONS = [4, 5, 6, 8, 10, 12];
const MAX_CPS = 8; // Chinese chars per second ceiling for natural delivery

// Each rule: [key, label, test(shot) => truthy if present/ok, severity]
const REQUIRED = [
  ["title", "标题", (s) => str(s.title)],
  ["composition", "构图", (s) => str(s.composition)],
  ["camera", "镜头规格", (s) => str(s.shot_size) || str(s.camera_movement) || str(s.camera)],
  ["setting", "场景", (s) => str(s.setting)],
  ["lighting", "光线", (s) => str(s.lighting)],
  ["action", "动作脚本", (s) => str(s.action)],
  ["prompt", "生图提示词", (s) => str(s.prompt)],
  ["negative_prompt", "负面提示词", (s) => str(s.negative_prompt)],
  ["video_prompt", "视频运动提示", (s) => str(s.video_prompt)],
  ["emotion", "情绪", (s) => str(s.emotion)],
  [
    "audio",
    "声音设计",
    (s) =>
      s.audio &&
      (str(s.audio.ambient) ||
        (s.audio.dialogue || []).length ||
        str(s.audio.narration) ||
        (s.audio.sfx || []).length ||
        str(s.audio.music)),
  ],
  ["transition", "转场", (s) => str(s.transition_in) && str(s.transition_out)],
  ["continuity", "连续性锚点", (s) => s.continuity && (s.continuity.anchors || []).length],
];

// A shot may be intentionally silent (pure visual / montage): no dialogue and no
// subtitles, but it must still carry sound design (ambient/sfx/music).
function isSilent(shot) {
  if (shot.silent === true) return true;
  const a = shot.audio || {};
  return !(a.dialogue || []).length && !str(a.narration);
}

function hasSoundBed(shot) {
  const a = shot.audio || {};
  return str(a.ambient) || (a.sfx || []).length || str(a.music);
}

function str(v) {
  return typeof v === "string" ? v.trim() : v ? String(v) : "";
}

function dialogueChars(shot) {
  return (shot.srt || [])
    .map((l) => (typeof l === "string" ? l : l.text || ""))
    .join("")
    .replace(/\s/g, "").length;
}

const project = JSON.parse(await fs.readFile(PROJECT, "utf8"));
let shots = project.shots || [];
if (episodeFilter) shots = shots.filter((s) => s.episode_id === episodeFilter);

const charIds = new Set((project.characters || []).map((c) => c.id));
const errors = [];
const warnings = [];
const ready = [];

for (const shot of shots) {
  const id = shot.id || "(missing id)";
  const before = errors.length;
  const missing = REQUIRED.filter(([, , test]) => !(/** @type {any} */ (test)(shot))).map(([, label]) => label);
  for (const label of missing) errors.push(`${id}: 缺「${label}」`);

  const dur = Number(shot.duration_seconds);
  if (!ALLOWED_DURATIONS.includes(dur)) {
    errors.push(`${id}: 时长 ${shot.duration_seconds ?? "?"}s 不在允许集合 {${ALLOWED_DURATIONS.join("/")}}`);
  }

  const silent = isSilent(shot);
  if (silent) {
    // Pure-visual shot: needs a sound bed instead of subtitles.
    if (!hasSoundBed(shot)) errors.push(`${id}: 纯画面镜缺声音床（ambient/sfx/music 至少其一）`);
  } else {
    if (!(shot.srt || []).length) errors.push(`${id}: 缺「台词时间轴」`);
    if ((shot.srt || []).length && dur) {
      const cps = dialogueChars(shot) / dur;
      if (cps > MAX_CPS) warnings.push(`${id}: 台词过密 ${cps.toFixed(1)} 字/秒 (>${MAX_CPS})，生视频会赶/对不上口型`);
    }
  }

  for (const cid of shot.characters || []) {
    if (!charIds.has(cid)) errors.push(`${id}: 未知角色 ${cid}`);
    const c = (project.characters || []).find((x) => x.id === cid);
    if (c && !c.reference_card?.image_asset?.startsWith("/generated/")) {
      warnings.push(`${id}: 角色「${c.name || cid}」无参考卡图，图生图一致性会漂移`);
    }
  }

  if (errors.length === before) ready.push(silent ? `${id} (纯画面)` : id);
}

const total = shots.length;
console.log(`分镜就绪校验：${PROJECT}${episodeFilter ? `  [${episodeFilter}]` : ""}`);
console.log(`视频就绪 ${ready.length}/${total}  | 错误 ${errors.length}  | 警告 ${warnings.length}\n`);
if (errors.length) console.log(`❌ 错误（必须修复）：\n${errors.map((e) => `  - ${e}`).join("\n")}\n`);
if (warnings.length) console.log(`⚠️  警告：\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`);
if (!errors.length && !warnings.length) console.log("✅ 全部分镜达到视频就绪标准。");

if (errors.length || (strict && warnings.length)) process.exit(1);
