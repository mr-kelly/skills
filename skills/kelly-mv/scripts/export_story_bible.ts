#!/usr/bin/env node
// Export a readable MV concept + shotlist as markdown for handoff/pitch.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const PROJECT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(SKILL_DIR, "app", ".data", "project.json");
const EXPORT_DIR = path.join(SKILL_DIR, "exports");

const project = JSON.parse(await fs.readFile(PROJECT, "utf8"));
const song = project.song || {};
const treatment = project.treatment || {};

function lines(items) {
  return (items || []).map((item) => `- ${item}`).join("\n");
}
function characterName(id) {
  return (project.characters || []).find((character) => character.id === id)?.name || id;
}
function fmt(t) {
  const n = Number(t) || 0;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const out = [];
out.push(`# MV: ${song.title || "Untitled"}${song.artist ? ` — ${song.artist}` : ""}`);
out.push("");
out.push(
  `**Artist:** ${song.artist || ""}${song.duration_seconds ? `  |  **Duration:** ${fmt(song.duration_seconds)}` : ""}${song.audio_asset ? "  |  audio uploaded" : ""}`,
);
out.push("");
out.push("## Concept");
out.push(`- Summary: ${treatment.summary || treatment.concept || ""}`);
out.push(`- Look: ${treatment.look || treatment.realism_target || ""}`);
out.push(`- Aspect ratio: ${treatment.aspect_ratio || ""}`);
out.push("");
out.push("## Cast");
for (const character of project.characters || []) {
  const visual = character.visual || {};
  out.push(`### ${character.name} (${character.id})`);
  out.push(`- Role: ${character.role || ""}`);
  out.push(`- Look: ${visual.front || ""}`);
  out.push(`- Wardrobe: ${visual.wardrobe || ""}`);
  out.push(`- Anchors: ${(visual.anchors || []).join(", ")}`);
  out.push(`- Forbidden drift: ${(visual.forbidden_drift || []).join(", ")}`);
  out.push("");
}
out.push("## Shotlist");
let n = 0;
for (const shot of project.shots || []) {
  n += 1;
  out.push(`### ${n}. ${shot.title} (${shot.id}) · ${shot.duration_seconds || "?"}s`);
  out.push(`- Cast: ${(shot.characters || []).map(characterName).join(", ") || "（空镜）"}`);
  out.push(`- Description: ${shot.description || ""}`);
  if (shot.video_prompt) out.push(`- Motion: ${shot.video_prompt}`);
  if (shot.image_asset) out.push(`- Image: ${shot.image_asset}`);
  if (shot.video_asset) out.push(`- Video: ${shot.video_asset}`);
  out.push("");
}

await fs.mkdir(EXPORT_DIR, { recursive: true });
const safeTitle =
  String(song.title || "kelly-mv")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "kelly-mv";
const outputPath = path.join(EXPORT_DIR, `${safeTitle}-mv-treatment.md`);
await fs.writeFile(outputPath, `${out.join("\n")}\n`, "utf8");
console.log(`Exported MV treatment: ${outputPath}`);
