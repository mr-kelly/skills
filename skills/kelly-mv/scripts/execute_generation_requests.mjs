#!/usr/bin/env node
// Trusted hand-off step for AI generation. Kelly MV's AirApp can only WRITE A
// REQUEST onto a cast/shot record (`reference_card_status` / `image_status` /
// `video_status` = "requested") — it can never hold the image-API key or
// spawn the local LTX video process itself. This script is the process
// authorized to act on those requests: it re-reads Busabase, performs the
// real generation call, uploads the result as a Busabase Asset, and flips
// status to "generated" (or "blocked" with an error note on failure).
//
// Mirrors the retired local app's agent_execution task queue
// (queueAgentTask -> scripts/execute_agent_tasks.ts) one-for-one, just reading
// requests off Busabase record fields instead of a local agent_tasks.json —
// there is no separate decisions/tasks bucket, per the migration recipe.
//
// Usage:
//   node scripts/execute_generation_requests.mjs [--apply] [--character <id>] [--shot <id>] [--kind image|video]
//
// Without --apply this is a dry run that only prints what would be
// generated. Requires KELLY_MV_IMAGE_API_KEY for character-card/storyboard
// image generation (an OpenAI-images-compatible endpoint); draft shot video
// generation requires a local LTX-Video checkout (see gen_draft_video.mjs).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectShotReferences, storyboardPrompt } from "../content/kelly-mv-app/app/js/mv-model.js";
import { generateDraftVideo } from "./gen_draft_video.mjs";
import {
  connect,
  downloadAssetToFile,
  parseJsonArray,
  readAllRecords,
  uploadAssetFromBytes,
  upsert,
} from "./lib/mv-busabase.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/execute_generation_requests.mjs [--apply] [--character <id>] [--shot <id>] [--kind image|video]

Reads cast/shot records with a "requested" generation status from Busabase.
Without --apply this is a dry run that only prints what would be generated.
With --apply it performs the real generation call, uploads the result as a
Busabase Asset, and updates the record's status to "generated" or "blocked".`);
}

function flagValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const DEFAULT_IMAGE_BASE_URL = "https://moonrouter.dev/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";

function imageBytesFromResponse(data) {
  const first = data?.data?.[0];
  const b64 = first?.b64_json || first?.image_base64 || first?.base64;
  if (!b64) throw new Error("Image API response did not include base64 image data.");
  return Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ""), "base64");
}

async function callImageApi(prompt, config) {
  const response = await fetch(`${config.base_url}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, prompt, size: config.size, response_format: "b64_json" }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Image API failed: ${response.status}`);
  return imageBytesFromResponse(data);
}

async function callImageEdits(prompt, referenceFiles, config) {
  const form = new FormData();
  form.append("model", config.model);
  form.append("prompt", prompt);
  form.append("size", config.size);
  form.append("n", "1");
  for (const file of referenceFiles) {
    form.append("image[]", new Blob([file.bytes], { type: "image/png" }), file.name);
  }
  const response = await fetch(`${config.base_url}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.api_key}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data?.error?.message || data?.message || `Image edits API failed: ${response.status}`);
  return imageBytesFromResponse(data);
}

function characterCardPrompt(character, project) {
  const treatment = project.treatment || {};
  return [
    character.reference_card?.prompt || "",
    treatment.look ? `MV visual style: ${treatment.look}` : "",
    treatment.aspect_ratio ? `Aspect ratio: ${treatment.aspect_ratio}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadImageConfig(client, basesByKey) {
  const settingsRows = await readAllRecords(client, basesByKey.get("settings"));
  const row = settingsRows.find((r) => r.record_id === "config") || {};
  return {
    base_url: row.image_base_url || DEFAULT_IMAGE_BASE_URL,
    model: row.image_model || DEFAULT_IMAGE_MODEL,
    size: row.image_size || DEFAULT_IMAGE_SIZE,
    api_key: process.env.KELLY_MV_IMAGE_API_KEY || "",
  };
}

// Build the same {song, treatment, characters, shots} shape mv-model.js
// expects, using Busabase asset URLs (not local paths) as image_asset so
// storyboardPrompt/collectShotReferences work unmodified.
function buildProject({ projectRow, castRows, shotRows, urlOf }) {
  return {
    project_id: projectRow.project_id,
    song: { title: projectRow.song_title, artist: projectRow.song_artist },
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
        visual: { front: row.visual_front },
        reference_card: {
          prompt: row.reference_card_prompt,
          image_asset: row.reference_card_asset_id ? urlOf(row.reference_card_asset_id) : "",
          assetId: row.reference_card_asset_id,
        },
      })),
    shots: shotRows
      .filter((row) => row.deleted !== "true")
      .map((row) => ({
        id: row.shot_id,
        title: row.title,
        description: row.description,
        negative_prompt: row.negative_prompt,
        characters: parseJsonArray(row.characters_json),
      })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const apply = args.includes("--apply");
  const onlyCharacter = flagValue(args, "--character");
  const onlyShot = flagValue(args, "--shot");
  const onlyKind = flagValue(args, "--kind");

  const { client, basesByKey } = await connect();
  const [projectRows, castRows, shotRows] = await Promise.all([
    readAllRecords(client, basesByKey.get("project")),
    readAllRecords(client, basesByKey.get("cast")),
    readAllRecords(client, basesByKey.get("shots")),
  ]);
  const projectRow = projectRows[0] || {};
  const imageConfig = await loadImageConfig(client, basesByKey);

  const pendingCards = castRows.filter(
    (row) =>
      row.deleted !== "true" &&
      row.reference_card_status === "requested" &&
      (!onlyCharacter || row.character_id === onlyCharacter),
  );
  const pendingImages = shotRows.filter(
    (row) =>
      row.deleted !== "true" &&
      row.image_status === "requested" &&
      (!onlyShot || row.shot_id === onlyShot) &&
      (!onlyKind || onlyKind === "image"),
  );
  const pendingVideos = shotRows.filter(
    (row) =>
      row.deleted !== "true" &&
      row.video_status === "requested" &&
      (!onlyShot || row.shot_id === onlyShot) &&
      (!onlyKind || onlyKind === "video"),
  );

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          character_cards: pendingCards.map((r) => r.character_id),
          storyboard_images: pendingImages.map((r) => r.shot_id),
          shot_videos: pendingVideos.map((r) => r.shot_id),
        },
        null,
        2,
      ),
    );
    return;
  }

  // Character reference cards: text-to-image only (a card has no prior
  // reference image to edit from).
  for (const row of pendingCards) {
    try {
      if (!imageConfig.api_key) throw new Error("KELLY_MV_IMAGE_API_KEY is not set.");
      const project = buildProject({ projectRow, castRows, shotRows, urlOf: () => "" });
      const character = project.characters.find((c) => c.id === row.character_id);
      const bytes = await callImageApi(
        characterCardPrompt(character || { reference_card: { prompt: row.reference_card_prompt } }, project),
        imageConfig,
      );
      const { assetId } = await uploadAssetFromBytes(
        client,
        bytes,
        `${row.character_id}-reference-card.png`,
        "image/png",
        "kelly-mv/generation",
      );
      await upsert(
        client,
        basesByKey.get("cast"),
        "character-id",
        row.character_id,
        {
          ...toCharacterFields(row),
          reference_card_asset_id: assetId,
          reference_card_status: "generated",
          reference_card_generated_at: new Date().toISOString(),
          reference_card_generation_json: JSON.stringify({
            provider: "openai-compatible",
            base_url: imageConfig.base_url,
            model: imageConfig.model,
          }),
        },
        `Generate reference card for ${row.character_id}`,
      );
      console.log(`generated reference card: ${row.character_id}`);
    } catch (error) {
      console.error(`FAILED reference card ${row.character_id}: ${error.message}`);
      await upsert(
        client,
        basesByKey.get("cast"),
        "character-id",
        row.character_id,
        { ...toCharacterFields(row), reference_card_status: "blocked" },
        `Reference card generation failed for ${row.character_id}`,
      );
    }
  }

  // Storyboard images: image-edit (character consistency) when any on-screen
  // character has a generated reference card, else text-to-image.
  const urlCache = new Map();
  const urlOf = (assetId) => (assetId ? urlCache.get(assetId) || "" : "");
  for (const row of pendingImages) {
    try {
      if (!imageConfig.api_key) throw new Error("KELLY_MV_IMAGE_API_KEY is not set.");
      // Resolve reference-card asset ids to fetchable URLs on demand.
      for (const cast of castRows) {
        if (cast.reference_card_asset_id && !urlCache.has(cast.reference_card_asset_id)) {
          const asset = await client.assets.get({ assetId: cast.reference_card_asset_id }).catch(() => null);
          if (asset?.asset?.url) urlCache.set(cast.reference_card_asset_id, asset.asset.url);
        }
      }
      const project = buildProject({ projectRow, castRows, shotRows, urlOf });
      const shot = project.shots.find((s) => s.id === row.shot_id);
      const prompt = storyboardPrompt(project, shot);
      const refs = collectShotReferences(project, shot);
      let bytes;
      let mode;
      if (refs.length) {
        const referenceFiles = [];
        for (const ref of refs) {
          const character = castRows.find((c) => c.character_id === ref.id);
          if (!character?.reference_card_asset_id) continue;
          const tmpPath = path.join(SKILL_DIR, "app", ".cache", `ref-${character.character_id}.png`);
          await downloadAssetToFile(client, character.reference_card_asset_id, tmpPath);
          const bytesBuf = await fs.readFile(tmpPath);
          referenceFiles.push({ name: path.basename(tmpPath), bytes: bytesBuf });
        }
        bytes = await callImageEdits(prompt, referenceFiles, imageConfig);
        mode = "image-edit";
      } else {
        bytes = await callImageApi(prompt, imageConfig);
        mode = "text-to-image";
      }
      const { assetId } = await uploadAssetFromBytes(
        client,
        bytes,
        `${row.shot_id}-storyboard.png`,
        "image/png",
        "kelly-mv/generation",
      );
      const generatedAt = new Date().toISOString();
      const generation = {
        provider: "openai-compatible",
        base_url: imageConfig.base_url,
        model: imageConfig.model,
        mode,
      };
      const candidates = [
        ...parseJsonArray(row.image_candidates_json),
        { assetId, generated_at: generatedAt, generation },
      ];
      await upsert(
        client,
        basesByKey.get("shots"),
        "shot-id",
        row.shot_id,
        {
          ...toShotFields(row),
          image_asset_id: assetId,
          image_status: "generated",
          image_generated_at: generatedAt,
          image_generation_json: JSON.stringify(generation),
          image_candidates_json: JSON.stringify(candidates),
        },
        `Generate storyboard image for ${row.shot_id}`,
      );
      console.log(`generated storyboard image: ${row.shot_id} (${mode})`);
    } catch (error) {
      console.error(`FAILED storyboard image ${row.shot_id}: ${error.message}`);
      await upsert(
        client,
        basesByKey.get("shots"),
        "shot-id",
        row.shot_id,
        { ...toShotFields(row), image_status: "blocked" },
        `Storyboard image generation failed for ${row.shot_id}`,
      );
    }
  }

  // Draft shot video: local LTX-Video, image-to-video from the shot's active
  // storyboard image. Genuinely local (no cloud call, no API key) but still
  // cannot run in the browser — it spawns a child process against a local
  // model checkout.
  for (const row of pendingVideos) {
    try {
      if (!row.image_asset_id) throw new Error("该分镜还没有分镜图，请先生成分镜图（草稿视频基于关键帧做图生视频）。");
      const imageAbs = path.join(SKILL_DIR, "app", ".cache", `${row.shot_id}-keyframe.png`);
      await downloadAssetToFile(client, row.image_asset_id, imageAbs);
      const outAbs = path.join(SKILL_DIR, "app", ".cache", `${row.shot_id}-draft.mp4`);
      await generateDraftVideo({
        image: imageAbs,
        prompt: row.video_prompt || row.title || row.shot_id,
        output: outAbs,
        durationSeconds: Number(row.duration_seconds) || 4,
      });
      const bytes = await fs.readFile(outAbs);
      const { assetId } = await uploadAssetFromBytes(
        client,
        bytes,
        `${row.shot_id}-draft.mp4`,
        "video/mp4",
        "kelly-mv/generation",
      );
      const generatedAt = new Date().toISOString();
      const generation = { mode: "draft", backend: "ltx-video-mps", source_image: row.image_asset_id };
      const candidates = [
        ...parseJsonArray(row.video_candidates_json),
        { assetId, generated_at: generatedAt, generation },
      ];
      await upsert(
        client,
        basesByKey.get("shots"),
        "shot-id",
        row.shot_id,
        {
          ...toShotFields(row),
          video_asset_id: assetId,
          video_status: "generated",
          video_generated_at: generatedAt,
          video_generation_json: JSON.stringify(generation),
          video_candidates_json: JSON.stringify(candidates),
        },
        `Generate draft video for ${row.shot_id}`,
      );
      console.log(`generated draft video: ${row.shot_id}`);
    } catch (error) {
      console.error(`FAILED draft video ${row.shot_id}: ${error.message}`);
      await upsert(
        client,
        basesByKey.get("shots"),
        "shot-id",
        row.shot_id,
        { ...toShotFields(row), video_status: "blocked" },
        `Draft video generation failed for ${row.shot_id}`,
      );
    }
  }
}

function toCharacterFields(row) {
  return {
    character_id: row.character_id,
    name: row.name || "",
    role: row.role || "",
    status: row.status || "draft",
    actor_profile: row.actor_profile || "",
    visual_front: row.visual_front || "",
    visual_side: row.visual_side || "",
    visual_back: row.visual_back || "",
    wardrobe: row.wardrobe || "",
    anchors_json: row.anchors_json || "[]",
    forbidden_drift_json: row.forbidden_drift_json || "[]",
    reference_card_status: row.reference_card_status || "draft",
    reference_card_prompt: row.reference_card_prompt || "",
    reference_card_asset_id: row.reference_card_asset_id || "",
    reference_card_generated_at: row.reference_card_generated_at || "",
    reference_card_generation_json: row.reference_card_generation_json || "{}",
    deleted: row.deleted || "false",
  };
}

function toShotFields(row) {
  return {
    shot_id: row.shot_id,
    position: row.position ?? 0,
    title: row.title || "",
    status: row.status || "draft",
    description: row.description || "",
    negative_prompt: row.negative_prompt || "",
    video_prompt: row.video_prompt || "",
    duration_seconds: row.duration_seconds ?? 8,
    characters_json: row.characters_json || "[]",
    image_asset_id: row.image_asset_id || "",
    image_status: row.image_status || "draft",
    image_generated_at: row.image_generated_at || "",
    image_generation_json: row.image_generation_json || "{}",
    image_candidates_json: row.image_candidates_json || "[]",
    video_asset_id: row.video_asset_id || "",
    video_status: row.video_status || "draft",
    video_generated_at: row.video_generated_at || "",
    video_generation_json: row.video_generation_json || "{}",
    video_candidates_json: row.video_candidates_json || "[]",
    deleted: row.deleted || "false",
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
