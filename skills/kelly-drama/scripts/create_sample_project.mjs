#!/usr/bin/env node
// Seed the Busabase workspace with the bundled starter drama (三国演义,
// one episode per original chapter). Ported from the retired
// scripts/create_sample_project.ts, which wrote straight to the
// local/Busabase data-provider; this trusted script writes the same starter
// content as real Busabase records across all 7 Bases. Defaults to a dry run
// since it writes project data — pass --apply to actually create records.
//
// assets/starter-project.json predates this schema in a couple of spots
// (its relationships use {from,to,label,type,tension} instead of the
// {public_status,hidden_truth,power_dynamic,emotional_temperature,conflict,
// evidence} shape references/ui-schema.md documents, and its shots predate
// the video-ready production-sheet fields) — this script maps every field it
// can find and leaves the rest at the schema's normal default, exactly like
// editing an under-filled shot/relationship in the app itself.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, upsert } from "./lib/drama-busabase.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STARTER_PATH = path.join(SKILL_DIR, "assets", "starter-project.json");

function help() {
  console.log(`Usage: node scripts/create_sample_project.mjs [--apply]

Seeds the Busabase workspace with the bundled starter drama
(assets/starter-project.json): the series bible, characters, relationships,
episodes, shots, and tasks. Without --apply this only prints a summary of
what would be written.`);
}

function j(value) {
  return JSON.stringify(value ?? []);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const apply = args.includes("--apply");

  const starter = JSON.parse(await fs.readFile(STARTER_PATH, "utf8"));
  const series = starter.series || {};
  const bible = series.visual_bible || {};

  const projectFields = {
    project_id: starter.project_id || "kelly-drama-project",
    title: series.title || "",
    logline: series.logline || "",
    genre: series.genre || "",
    platform: series.platform || "",
    format: series.format || "",
    tone: series.tone || "",
    audience: series.audience || "",
    hook_rules_json: j(series.hook_rules),
    world_rules_json: j(series.world_rules),
    hyperframe_project_path: series.hyperframe_project_path || "",
    hyperframe_status_json: "{}",
    hyperframe_status_updated_at: "",
    visual_format_note: bible.format_note || "",
    visual_realism_target: bible.realism_target || "",
    visual_cinematography: bible.cinematography || "",
    visual_color_palette: bible.color_palette || "",
    visual_period_detail: bible.period_detail || "",
    visual_aspect_ratio: bible.aspect_ratio || "",
    visual_orientation: bible.orientation || "",
    visual_style_medium: bible.style_medium || "",
    visual_background_refs_json: j(bible.background_reference_assets?.map((a) => ({ ...a, assetId: "" }))),
    updated_at: new Date().toISOString(),
  };

  const characterFields = (starter.characters || []).map((c) => {
    const card = c.character_card || {};
    const visual = c.visual || {};
    const vp = c.voice_profile || {};
    const ref = c.reference_card || {};
    return {
      character_id: c.id,
      name: c.name || "",
      role: c.role || "",
      status: c.status || "draft",
      actor_profile: c.actor_profile || "",
      card_identity: card.identity || "",
      card_motivation: card.motivation || "",
      card_wound: card.wound || "",
      card_secret: card.secret || "",
      card_arc: card.arc || "",
      card_voice: card.voice || "",
      visual_front: visual.front || "",
      visual_side: visual.side || "",
      visual_back: visual.back || "",
      visual_wardrobe: visual.wardrobe || "",
      visual_anchors_json: j(visual.anchors),
      visual_forbidden_drift_json: j(visual.forbidden_drift),
      voice_type: vp.type || "",
      voice_pace: vp.pace || "",
      voice_accent: vp.accent || "",
      voice_signature: vp.signature || "",
      voice_casting_reference: vp.casting_reference || "",
      voice_sample_script: vp.sample_script || "",
      reference_card_status: ref.status || "ready_to_generate",
      reference_card_purpose: ref.purpose || "",
      reference_card_prompt: ref.prompt || "",
      reference_card_asset_id: "",
      reference_card_generated_at: "",
      reference_card_generation_json: "{}",
      voice_reference_status: c.voice_reference?.status || "planned",
      voice_reference_provider: "",
      voice_reference_asset_id: "",
      voice_reference_generated_at: "",
      voice_reference_generation_json: "{}",
      voice_candidates_json: "[]",
      deleted: "false",
    };
  });

  const relationshipFields = (starter.relationships || []).map((r) => ({
    relationship_id: r.id,
    from_character_id: r.from || "",
    to_character_id: r.to || "",
    type: r.type || r.label || "",
    public_status: r.public_status || r.label || "",
    hidden_truth: r.hidden_truth || "",
    power_dynamic: r.power_dynamic || "",
    emotional_temperature: r.emotional_temperature || "",
    conflict: r.conflict || r.tension || "",
    evidence_json: j(r.evidence),
    deleted: "false",
  }));

  const episodeFields = (starter.episodes || []).map((e) => ({
    episode_id: e.id,
    number: e.number || 0,
    title: e.title || "",
    status: e.status || "draft",
    hyperframe_composition: e.hyperframe_composition || "",
    hyperframe_video_asset: e.hyperframe_video_asset || "",
    summary: e.summary || "",
    promise: e.promise || "",
    a_plot: e.a_plot || "",
    b_plot: e.b_plot || "",
    cliffhanger: e.cliffhanger || "",
    beats_json: j(e.beats),
    deleted: "false",
  }));

  const shotFields = (starter.shots || []).map((s, index) => ({
    shot_id: s.id,
    episode_id: s.episode_id || "",
    beat_id: s.beat_id || "",
    position: index + 1,
    title: s.title || "",
    status: s.status || "draft",
    duration_seconds: s.duration_seconds || 8,
    duration_preset: s.duration_preset || (s.duration_seconds ? `${s.duration_seconds}s` : ""),
    aspect_ratio: s.aspect_ratio || "",
    emotion: s.emotion || "",
    shot_size: s.shot_size || "",
    camera_angle: s.camera_angle || "",
    camera_movement: s.camera_movement || "",
    lens: s.lens || "",
    characters_json: j(s.characters),
    composition: s.composition || "",
    camera: s.camera || "",
    setting: s.setting || "",
    lighting: s.lighting || "",
    action: s.action || "",
    prompt: s.prompt || "",
    video_prompt: s.video_prompt || "",
    negative_prompt: s.negative_prompt || "",
    transition_in: s.transition_in || "",
    transition_out: s.transition_out || "",
    silent: s.silent === true ? "true" : "false",
    audio_json: JSON.stringify(s.audio || {}),
    srt_json: j(s.srt),
    continuity_json: JSON.stringify(s.continuity || {}),
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

  const taskFields = (starter.tasks || []).map((t) => ({
    task_id: t.id,
    kind: t.kind || "episode",
    target_id: t.target_id || "",
    status: t.status || "needs_review",
    title: t.title || "",
    note: t.note || "",
    deleted: "false",
  }));

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          project: projectFields,
          counts: {
            characters: characterFields.length,
            relationships: relationshipFields.length,
            episodes: episodeFields.length,
            shots: shotFields.length,
            tasks: taskFields.length,
          },
        },
        null,
        2,
      ),
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
    "Seed starter project",
  );
  for (const fields of characterFields) {
    await upsert(
      client,
      basesByKey.get("characters"),
      "character-id",
      fields.character_id,
      fields,
      `Seed character ${fields.character_id}`,
    );
  }
  for (const fields of relationshipFields) {
    await upsert(
      client,
      basesByKey.get("relationships"),
      "relationship-id",
      fields.relationship_id,
      fields,
      `Seed relationship ${fields.relationship_id}`,
    );
  }
  for (const fields of episodeFields) {
    await upsert(
      client,
      basesByKey.get("episodes"),
      "episode-id",
      fields.episode_id,
      fields,
      `Seed episode ${fields.episode_id}`,
    );
  }
  for (const fields of shotFields) {
    await upsert(client, basesByKey.get("shots"), "shot-id", fields.shot_id, fields, `Seed shot ${fields.shot_id}`);
  }
  for (const fields of taskFields) {
    await upsert(client, basesByKey.get("tasks"), "task-id", fields.task_id, fields, `Seed task ${fields.task_id}`);
  }
  console.log(
    `Created sample project: ${projectFields.project_id} (${characterFields.length} characters, ${relationshipFields.length} relationships, ${episodeFields.length} episodes, ${shotFields.length} shots, ${taskFields.length} tasks)`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
