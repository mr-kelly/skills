#!/usr/bin/env node
// Trusted hand-off step for AI generation. Kelly Drama's AirApp can only
// WRITE A REQUEST onto a character/shot record (`reference_card_status` /
// `voice_reference_status` / `image_status` / `video_status` = "requested")
// — it can never hold the image-API key, spawn the local Qwen3-TTS process,
// or spawn the local LTX-Video process itself. This script is the process
// authorized to act on those requests: it re-reads Busabase, performs the
// real generation call, uploads the result as a Busabase Asset, and flips
// status to "generated" (or "blocked" with an error note on failure).
//
// Mirrors the retired local app's agent_execution task queue
// (queueAgentTask -> scripts/execute_agent_tasks.ts) one-for-one, just
// reading requests off Busabase record fields instead of a local
// agent_tasks.json — there is no separate decisions/tasks bucket, per the
// migration recipe. Also mirrors Kelly MV's scripts/execute_generation_requests.mjs
// (this skill's closest architectural twin) for the image-generation half;
// the voice (Qwen3-TTS/mlx-audio) and video (Seedance/Ark cloud + LTX-Video
// local draft) halves are Kelly Drama-specific, ported from the retired
// lib/generation/{voice,video}-service.ts.
//
// Usage:
//   node scripts/execute_generation_requests.mjs [--apply] [--character <id>] [--shot <id>] [--kind image|video|voice|card]
//
// Without --apply this is a dry run that only prints what would be
// generated. Requires KELLY_DRAMA_IMAGE_API_KEY for character-card/storyboard
// image generation (an OpenAI-images-compatible endpoint), KELLY_DRAMA_ARK_API_KEY
// for prod (Seedance/Ark) shot video, and a local LTX-Video checkout for draft
// shot video (see gen_draft_video.mjs). Reference voices need a local Python
// with mlx-audio installed (KELLY_DRAMA_TTS_PYTHON, default "python3").
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  characterCardPrompt,
  collectShotReferences,
  draftPrompt,
  prodPrompt,
  storyboardPrompt,
  voiceInstruct,
  voiceScript,
} from "../content/kelly-drama-app/app/js/drama-model.js";
import { generateDraftVideo } from "./gen_draft_video.mjs";
import {
  connect,
  downloadAssetToFile,
  parseJsonArray,
  readAllRecords,
  uploadAssetFromBytes,
  uploadAssetFromFile,
  upsert,
} from "./lib/drama-busabase.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(SKILL_DIR, "app", ".cache");

function help() {
  console.log(`Usage: node scripts/execute_generation_requests.mjs [--apply] [--character <id>] [--shot <id>] [--kind image|video|voice|card]

Reads character/shot records with a "requested" generation status from
Busabase. Without --apply this is a dry run that only prints what would be
generated. With --apply it performs the real generation call, uploads the
result as a Busabase Asset, and updates the record's status to "generated"
or "blocked".`);
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

function loadImageConfig(settingsRow) {
  return {
    base_url: settingsRow.image_base_url || DEFAULT_IMAGE_BASE_URL,
    model: settingsRow.image_model || DEFAULT_IMAGE_MODEL,
    size: settingsRow.image_size || DEFAULT_IMAGE_SIZE,
    api_key: process.env.KELLY_DRAMA_IMAGE_API_KEY || "",
  };
}

// Build the same {series, characters, shots} shape drama-model.js expects,
// using Busabase asset URLs (not local paths) as image_asset so
// storyboardPrompt/collectShotReferences/characterCardPrompt work unmodified.
function buildProject({ projectRow, characterRows, urlOf }) {
  return {
    series: {
      title: projectRow.title,
      logline: projectRow.logline,
      visual_bible: {
        realism_target: projectRow.visual_realism_target,
        cinematography: projectRow.visual_cinematography,
        color_palette: projectRow.visual_color_palette,
        aspect_ratio: projectRow.visual_aspect_ratio,
        orientation: projectRow.visual_orientation,
        style_medium: projectRow.visual_style_medium,
      },
    },
    characters: characterRows
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
  };
}

function toCharacterFields(row) {
  return {
    character_id: row.character_id,
    name: row.name || "",
    role: row.role || "",
    status: row.status || "draft",
    actor_profile: row.actor_profile || "",
    card_identity: row.card_identity || "",
    card_motivation: row.card_motivation || "",
    card_wound: row.card_wound || "",
    card_secret: row.card_secret || "",
    card_arc: row.card_arc || "",
    card_voice: row.card_voice || "",
    visual_front: row.visual_front || "",
    visual_side: row.visual_side || "",
    visual_back: row.visual_back || "",
    visual_wardrobe: row.visual_wardrobe || "",
    visual_anchors_json: row.visual_anchors_json || "[]",
    visual_forbidden_drift_json: row.visual_forbidden_drift_json || "[]",
    voice_type: row.voice_type || "",
    voice_pace: row.voice_pace || "",
    voice_accent: row.voice_accent || "",
    voice_signature: row.voice_signature || "",
    voice_casting_reference: row.voice_casting_reference || "",
    voice_sample_script: row.voice_sample_script || "",
    reference_card_status: row.reference_card_status || "draft",
    reference_card_purpose: row.reference_card_purpose || "",
    reference_card_prompt: row.reference_card_prompt || "",
    reference_card_asset_id: row.reference_card_asset_id || "",
    reference_card_generated_at: row.reference_card_generated_at || "",
    reference_card_generation_json: row.reference_card_generation_json || "{}",
    voice_reference_status: row.voice_reference_status || "planned",
    voice_reference_provider: row.voice_reference_provider || "",
    voice_reference_asset_id: row.voice_reference_asset_id || "",
    voice_reference_generated_at: row.voice_reference_generated_at || "",
    voice_reference_generation_json: row.voice_reference_generation_json || "{}",
    voice_candidates_json: row.voice_candidates_json || "[]",
    deleted: row.deleted || "false",
  };
}

function toShotFields(row) {
  return {
    shot_id: row.shot_id,
    episode_id: row.episode_id || "",
    beat_id: row.beat_id || "",
    position: row.position ?? 0,
    title: row.title || "",
    status: row.status || "draft",
    duration_seconds: row.duration_seconds ?? 8,
    duration_preset: row.duration_preset || "",
    aspect_ratio: row.aspect_ratio || "",
    emotion: row.emotion || "",
    shot_size: row.shot_size || "",
    camera_angle: row.camera_angle || "",
    camera_movement: row.camera_movement || "",
    lens: row.lens || "",
    characters_json: row.characters_json || "[]",
    composition: row.composition || "",
    camera: row.camera || "",
    setting: row.setting || "",
    lighting: row.lighting || "",
    action: row.action || "",
    prompt: row.prompt || "",
    video_prompt: row.video_prompt || "",
    negative_prompt: row.negative_prompt || "",
    transition_in: row.transition_in || "",
    transition_out: row.transition_out || "",
    silent: row.silent || "false",
    audio_json: row.audio_json || "{}",
    srt_json: row.srt_json || "[]",
    continuity_json: row.continuity_json || "{}",
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// PROD MODE — Seedance 2.0 via BytePlus/Volcengine Ark (submit -> poll -> download).
// Ported from the retired lib/generation/video-service.ts's generateShotVideoProd.
async function generateProdVideo({ shotRow, settingsRow, keyframeUrl }) {
  const apiKey = process.env.KELLY_DRAMA_ARK_API_KEY || "";
  if (!apiKey) throw new Error("KELLY_DRAMA_ARK_API_KEY is not set.");
  const base = String(settingsRow.video_ark_base_url || "https://ark.ap-southeast.bytepluses.com/api/v3").replace(
    /\/+$/,
    "",
  );
  const model = settingsRow.video_ark_model || "dreamina-seedance-2-0-260128";
  const resolution = settingsRow.video_prod_resolution || "720p";
  const ratio = settingsRow.video_prod_ratio || "16:9";
  const watermark = settingsRow.video_prod_watermark === "true";
  const wantAudio = settingsRow.video_generate_audio !== "false";
  const duration = Math.max(4, Math.min(Number(shotRow.duration_seconds) || 5, 15));
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const textPart = { type: "text", text: prodPrompt(toShotFields(shotRow)) };
  const hasImage = Boolean(keyframeUrl);
  const i2vContent = hasImage ? [textPart, { type: "image_url", image_url: { url: keyframeUrl } }] : null;
  const t2vContent = [textPart];

  const submit = async (content, generateAudio) => {
    const response = await fetch(`${base}/contents/generations/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, content, ratio, duration, resolution, watermark, generate_audio: generateAudio }),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, id: data.id, err: data?.error?.message || data?.message || `HTTP ${response.status}` };
  };
  const poll = async (taskId) => {
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(5000);
      const response = await fetch(`${base}/contents/generations/tasks/${taskId}`, { headers });
      const data = await response.json().catch(() => ({}));
      if (data?.status === "succeeded") return { url: data?.content?.video_url || "" };
      if (["failed", "cancelled", "expired"].includes(data?.status))
        return { fail: `${data.status}: ${data?.error?.message || ""}` };
    }
    return { fail: "timeout" };
  };
  const attempt = async (content, generateAudio) => {
    const submitted = await submit(content, generateAudio);
    if (!submitted.ok || !submitted.id) return { submitErr: submitted.err };
    const polled = await poll(submitted.id);
    return polled.url ? { url: polled.url } : { pollErr: polled.fail };
  };

  const method = hasImage ? "image-to-video" : "text-to-video";
  let audioOn = wantAudio;
  const content = i2vContent || t2vContent;
  let result = await attempt(content, wantAudio);
  if (result.pollErr && /audio|sensitiv|敏感/i.test(result.pollErr) && wantAudio) {
    audioOn = false;
    result = await attempt(content, false);
  }
  if (result.submitErr) throw new Error(`Seedance submit failed: ${result.submitErr}`);
  if (result.pollErr) throw new Error(`Seedance task failed: ${result.pollErr}`);
  if (!result.url) throw new Error("Seedance produced no video.");

  const response = await fetch(result.url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    generation: {
      mode: "prod",
      backend: "seedance-2.0-ark",
      model,
      method,
      audio: audioOn,
      resolution,
      ratio,
      duration,
      source_image: hasImage ? keyframeUrl : "",
    },
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
  const [projectRows, characterRows, shotRows, settingsRows] = await Promise.all([
    readAllRecords(client, basesByKey.get("project")),
    readAllRecords(client, basesByKey.get("characters")),
    readAllRecords(client, basesByKey.get("shots")),
    readAllRecords(client, basesByKey.get("settings")),
  ]);
  const projectRow = projectRows[0] || {};
  const settingsRow = settingsRows.find((row) => row.record_id === "config") || {};
  const imageConfig = loadImageConfig(settingsRow);

  const pendingCards = characterRows.filter(
    (row) =>
      row.deleted !== "true" &&
      row.reference_card_status === "requested" &&
      (!onlyCharacter || row.character_id === onlyCharacter) &&
      (!onlyKind || onlyKind === "card"),
  );
  const pendingVoices = characterRows.filter(
    (row) =>
      row.deleted !== "true" &&
      row.voice_reference_status === "requested" &&
      (!onlyCharacter || row.character_id === onlyCharacter) &&
      (!onlyKind || onlyKind === "voice"),
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
      String(row.video_status || "").startsWith("requested") &&
      (!onlyShot || row.shot_id === onlyShot) &&
      (!onlyKind || onlyKind === "video"),
  );

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          reference_cards: pendingCards.map((r) => r.character_id),
          reference_voices: pendingVoices.map((r) => r.character_id),
          storyboard_images: pendingImages.map((r) => r.shot_id),
          shot_videos: pendingVideos.map((r) => r.shot_id),
        },
        null,
        2,
      ),
    );
    return;
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });

  // Character reference cards: text-to-image only (a card has no prior
  // reference image to edit from), same as lib/generation/image-service.ts's
  // generateCharacterCard.
  for (const row of pendingCards) {
    try {
      if (!imageConfig.api_key) throw new Error("KELLY_DRAMA_IMAGE_API_KEY is not set.");
      const project = buildProject({ projectRow, characterRows, urlOf: () => "" });
      const character = project.characters.find((c) => c.id === row.character_id) || {
        reference_card: { prompt: row.reference_card_prompt },
      };
      const bytes = await callImageApi(characterCardPrompt(character, project), imageConfig);
      const { assetId } = await uploadAssetFromBytes(
        client,
        bytes,
        `${row.character_id}-reference-card.png`,
        "image/png",
        "kelly-drama/generation",
      );
      await upsert(
        client,
        basesByKey.get("characters"),
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
        basesByKey.get("characters"),
        "character-id",
        row.character_id,
        { ...toCharacterFields(row), reference_card_status: "blocked" },
        `Reference card generation failed for ${row.character_id}`,
      );
    }
  }

  // Reference voices: local Qwen3-TTS (mlx-audio) via gen_voice.py.
  const python = process.env.KELLY_DRAMA_TTS_PYTHON || "python3";
  for (const row of pendingVoices) {
    try {
      const character = {
        id: row.character_id,
        name: row.name,
        role: row.role,
        character_card: { voice: row.card_voice },
        voice_profile: {
          type: row.voice_type,
          pace: row.voice_pace,
          accent: row.voice_accent,
          signature: row.voice_signature,
          casting_reference: row.voice_casting_reference,
          sample_script: row.voice_sample_script,
        },
      };
      const model = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit";
      const outAbs = path.join(CACHE_DIR, `${row.character_id}-voice-${Date.now()}.wav`);
      const pyArgs = { model, text: voiceScript(character), instruct: voiceInstruct(character), output: outAbs };
      const scriptPath = path.join(SKILL_DIR, "scripts", "gen_voice.py");
      const outPath = await new Promise((resolve, reject) => {
        let out = "";
        let err = "";
        const child = spawn(python, [scriptPath, JSON.stringify(pyArgs)], { stdio: ["ignore", "pipe", "pipe"] });
        child.stdout.on("data", (d) => {
          out += d.toString();
        });
        child.stderr.on("data", (d) => {
          err += d.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0) return reject(new Error((err || out).trim() || `gen_voice.py exit ${code}`));
          resolve(out.trim().split("\n").filter(Boolean).pop()?.trim());
        });
      });
      const { assetId } = await uploadAssetFromFile(client, outPath, "audio/wav", "kelly-drama/generation");
      const generatedAt = new Date().toISOString();
      const generation = { backend: "qwen3-tts-mlx", model, instruct: pyArgs.instruct, script: pyArgs.text };
      const candidates = [
        ...parseJsonArray(row.voice_candidates_json),
        { assetId, generated_at: generatedAt, generation },
      ];
      await upsert(
        client,
        basesByKey.get("characters"),
        "character-id",
        row.character_id,
        {
          ...toCharacterFields(row),
          voice_reference_status: "generated",
          voice_reference_provider: "qwen3-tts-mlx",
          voice_reference_asset_id: assetId,
          voice_reference_generated_at: generatedAt,
          voice_reference_generation_json: JSON.stringify(generation),
          voice_candidates_json: JSON.stringify(candidates),
        },
        `Generate reference voice for ${row.character_id}`,
      );
      console.log(`generated reference voice: ${row.character_id}`);
    } catch (error) {
      console.error(`FAILED reference voice ${row.character_id}: ${error.message}`);
      await upsert(
        client,
        basesByKey.get("characters"),
        "character-id",
        row.character_id,
        { ...toCharacterFields(row), voice_reference_status: "blocked" },
        `Reference voice generation failed for ${row.character_id}`,
      );
    }
  }

  // Storyboard images: image-edit (character consistency) when any on-screen
  // character has a generated reference card, else text-to-image.
  const urlCache = new Map();
  const urlOf = (assetId) => (assetId ? urlCache.get(assetId) || "" : "");
  for (const row of pendingImages) {
    try {
      if (!imageConfig.api_key) throw new Error("KELLY_DRAMA_IMAGE_API_KEY is not set.");
      for (const character of characterRows) {
        if (character.reference_card_asset_id && !urlCache.has(character.reference_card_asset_id)) {
          const asset = await client.assets.get({ assetId: character.reference_card_asset_id }).catch(() => null);
          if (asset?.asset?.url) urlCache.set(character.reference_card_asset_id, asset.asset.url);
        }
      }
      const project = buildProject({ projectRow, characterRows, urlOf });
      const shot = {
        ...toShotFields(row),
        id: row.shot_id,
        characters: parseJsonArray(row.characters_json),
      };
      const prompt = storyboardPrompt(project, shot);
      const refs = collectShotReferences(project, shot);
      let bytes;
      let mode;
      if (refs.length) {
        const referenceFiles = [];
        for (const ref of refs) {
          const character = characterRows.find((c) => c.character_id === ref.id);
          if (!character?.reference_card_asset_id) continue;
          const tmpPath = path.join(CACHE_DIR, `ref-${character.character_id}.png`);
          await downloadAssetToFile(client, character.reference_card_asset_id, tmpPath);
          referenceFiles.push({ name: path.basename(tmpPath), bytes: await fs.readFile(tmpPath) });
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
        "kelly-drama/generation",
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

  // Shot video: backend is encoded on the status value the browser wrote
  // ("requested:seedance" default, or "requested:ltx" for the local draft
  // path) — see js/providers/busabase-provider.js's requestShotVideoGeneration.
  for (const row of pendingVideos) {
    const backend = String(row.video_status || "").split(":")[1] || "seedance";
    try {
      if (!row.image_asset_id)
        throw new Error(
          "This shot has no storyboard image yet — generate the image first (video is image-to-video from the keyframe).",
        );
      if (backend === "ltx" || backend === "draft") {
        const imageAbs = path.join(CACHE_DIR, `${row.shot_id}-keyframe.png`);
        await downloadAssetToFile(client, row.image_asset_id, imageAbs);
        const outAbs = path.join(CACHE_DIR, `${row.shot_id}-draft.mp4`);
        await generateDraftVideo({
          image: imageAbs,
          prompt: draftPrompt(toShotFields(row)),
          output: outAbs,
          durationSeconds: Number(row.duration_seconds) || 4,
        });
        const bytes = await fs.readFile(outAbs);
        const { assetId } = await uploadAssetFromBytes(
          client,
          bytes,
          `${row.shot_id}-draft.mp4`,
          "video/mp4",
          "kelly-drama/generation",
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
      } else {
        const keyframe = await client.assets.get({ assetId: row.image_asset_id }).catch(() => null);
        const keyframeUrl = keyframe?.asset?.url || "";
        const { bytes, generation } = await generateProdVideo({ shotRow: row, settingsRow, keyframeUrl });
        const { assetId } = await uploadAssetFromBytes(
          client,
          bytes,
          `${row.shot_id}-prod.mp4`,
          "video/mp4",
          "kelly-drama/generation",
        );
        const generatedAt = new Date().toISOString();
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
          `Generate prod video for ${row.shot_id}`,
        );
        console.log(`generated prod video: ${row.shot_id}`);
      }
    } catch (error) {
      console.error(`FAILED shot video ${row.shot_id}: ${error.message}`);
      await upsert(
        client,
        basesByKey.get("shots"),
        "shot-id",
        row.shot_id,
        { ...toShotFields(row), video_status: "blocked" },
        `Shot video generation failed for ${row.shot_id}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
