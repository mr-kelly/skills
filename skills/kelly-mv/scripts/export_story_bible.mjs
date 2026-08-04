#!/usr/bin/env node
// Export a readable MV concept + shotlist as markdown for handoff/pitch.
// Ported from the retired scripts/export_story_bible.ts: reads from Busabase
// instead of the local project-store, same markdown shape and CLI contract
// (an optional positional path still reads a raw project.json directly —
// useful for exporting a project snapshot without a live Busabase session).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, parseJsonArray, readAllRecords } from "./lib/mv-busabase.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT_DIR = path.join(SKILL_DIR, "exports");

async function loadFromBusabase() {
  const { client, basesByKey } = await connect();
  const [projectRows, castRows, shotRows] = await Promise.all([
    readAllRecords(client, basesByKey.get("project")),
    readAllRecords(client, basesByKey.get("cast")),
    readAllRecords(client, basesByKey.get("shots")),
  ]);
  const projectRow = projectRows[0] || {};
  return {
    song: {
      title: projectRow.song_title,
      artist: projectRow.song_artist,
      duration_seconds: projectRow.song_duration_seconds,
      audio_asset: projectRow.song_audio_asset_id,
    },
    treatment: {
      summary: projectRow.treatment_summary,
      look: projectRow.treatment_look,
      aspect_ratio: projectRow.treatment_aspect_ratio,
    },
    characters: castRows
      .filter((row) => row.deleted !== "true")
      .map((row) => ({
        id: row.character_id,
        name: row.name,
        role: row.role,
        visual: {
          front: row.visual_front,
          wardrobe: row.wardrobe,
          anchors: parseJsonArray(row.anchors_json),
          forbidden_drift: parseJsonArray(row.forbidden_drift_json),
        },
      })),
    shots: shotRows
      .filter((row) => row.deleted !== "true")
      .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
      .map((row) => ({
        id: row.shot_id,
        title: row.title,
        duration_seconds: row.duration_seconds,
        characters: parseJsonArray(row.characters_json),
        description: row.description,
        video_prompt: row.video_prompt,
        image_asset: row.image_asset_id,
        video_asset: row.video_asset_id,
      })),
  };
}

function characterName(project, id) {
  return (project.characters || []).find((character) => character.id === id)?.name || id;
}
function fmt(t) {
  const n = Number(t) || 0;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function main() {
  const explicitPath = process.argv[2];
  const project = explicitPath
    ? JSON.parse(await fs.readFile(path.resolve(explicitPath), "utf8"))
    : await loadFromBusabase();
  const song = project.song || {};
  const treatment = project.treatment || {};

  const out = [];
  out.push(`# MV: ${song.title || "Untitled"}${song.artist ? ` — ${song.artist}` : ""}`);
  out.push("");
  out.push(
    `**Artist:** ${song.artist || ""}${song.duration_seconds ? `  |  **Duration:** ${fmt(song.duration_seconds)}` : ""}${song.audio_asset ? "  |  audio uploaded" : ""}`,
  );
  out.push("");
  out.push("## Concept");
  out.push(`- Summary: ${treatment.summary || ""}`);
  out.push(`- Look: ${treatment.look || ""}`);
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
    out.push(`- Cast: ${(shot.characters || []).map((id) => characterName(project, id)).join(", ") || "（空镜）"}`);
    out.push(`- Description: ${shot.description || ""}`);
    if (shot.video_prompt) out.push(`- Motion: ${shot.video_prompt}`);
    if (shot.image_asset) out.push(`- Image asset: ${shot.image_asset}`);
    if (shot.video_asset) out.push(`- Video asset: ${shot.video_asset}`);
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
