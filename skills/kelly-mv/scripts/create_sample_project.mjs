#!/usr/bin/env node
// Seed the Busabase workspace with the bundled starter MV (静夜思). Ported
// from the retired scripts/create_sample_project.ts, which wrote straight to
// the local/Busabase data-provider; this trusted script writes the same
// starter content as real Busabase records. Defaults to a dry run since it
// writes project data — pass --apply to actually create records.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, upsert } from "./lib/mv-busabase.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STARTER_PATH = path.join(SKILL_DIR, "assets", "starter-project.json");

function help() {
  console.log(`Usage: node scripts/create_sample_project.mjs [--apply]

Seeds the Busabase workspace with the bundled starter MV (assets/starter-project.json):
one project row, its characters, and its shots. Without --apply this only
prints what would be written.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const apply = args.includes("--apply");

  const starter = JSON.parse(await fs.readFile(STARTER_PATH, "utf8"));

  const projectFields = {
    project_id: starter.project_id,
    song_title: starter.song?.title || "",
    song_artist: starter.song?.artist || "",
    song_audio_asset_id: "",
    song_duration_seconds: starter.song?.duration_seconds || 0,
    song_source: starter.song?.source || "",
    song_uploaded_at: "",
    treatment_summary: starter.treatment?.summary || "",
    treatment_look: starter.treatment?.look || "",
    treatment_aspect_ratio: starter.treatment?.aspect_ratio || "16:9",
    updated_at: new Date().toISOString(),
  };
  const castFields = (starter.characters || []).map((c) => ({
    character_id: c.id,
    name: c.name || "",
    role: c.role || "",
    status: c.status || "draft",
    actor_profile: c.actor_profile || "",
    visual_front: c.visual?.front || "",
    visual_side: c.visual?.side || "",
    visual_back: c.visual?.back || "",
    wardrobe: c.visual?.wardrobe || "",
    anchors_json: JSON.stringify(c.visual?.anchors || []),
    forbidden_drift_json: JSON.stringify(c.visual?.forbidden_drift || []),
    reference_card_status: c.reference_card?.status || "ready_to_generate",
    reference_card_prompt: c.reference_card?.prompt || "",
    reference_card_asset_id: "",
    reference_card_generated_at: "",
    reference_card_generation_json: "{}",
    deleted: "false",
  }));
  const shotFields = (starter.shots || []).map((s, index) => ({
    shot_id: s.id,
    position: index + 1,
    title: s.title || "",
    status: s.status || "draft",
    description: s.description || "",
    negative_prompt: s.negative_prompt || "",
    video_prompt: s.video_prompt || "",
    duration_seconds: s.duration_seconds || 8,
    characters_json: JSON.stringify(s.characters || []),
    image_asset_id: "",
    image_status: "draft",
    image_generated_at: "",
    image_generation_json: "{}",
    image_candidates_json: "[]",
    video_asset_id: "",
    video_status: "draft",
    video_generated_at: "",
    video_generation_json: "{}",
    video_candidates_json: "[]",
    deleted: "false",
  }));

  if (!apply) {
    console.log(
      JSON.stringify({ mode: "dry-run", project: projectFields, cast: castFields, shots: shotFields }, null, 2),
    );
    return;
  }

  const { client, basesByKey } = await connect();
  await upsert(
    client,
    basesByKey.get("project"),
    "project-id",
    projectFields.project_id,
    projectFields,
    "Seed starter MV project",
  );
  for (const fields of castFields) {
    await upsert(
      client,
      basesByKey.get("cast"),
      "character-id",
      fields.character_id,
      fields,
      `Seed starter character ${fields.character_id}`,
    );
  }
  for (const fields of shotFields) {
    await upsert(
      client,
      basesByKey.get("shots"),
      "shot-id",
      fields.shot_id,
      fields,
      `Seed starter shot ${fields.shot_id}`,
    );
  }
  console.log(
    `Created sample project: ${projectFields.project_id} (${castFields.length} characters, ${shotFields.length} shots)`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
