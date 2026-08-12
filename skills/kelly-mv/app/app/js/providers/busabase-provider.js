// Reads/writes the operator-provisioned Kelly MV Busabase workspace (one
// Folder, 4 Bases: project/settings/cast/shots) through js/busabase-client.js
// + js/mv-client.js (Asset upload/read) and normalizes with js/mv-model.js.
//
// Write scope, faithful to what the browser genuinely does today vs. what
// only a trusted process can do (see SKILL.md's Song Generation section and
// the migration recipe's "trusted-writer-script" pattern):
//   - Editing text fields (concept, song title/artist, cast visual notes,
//     shot description/duration/characters), uploading a NEW binary the user
//     already has (MP3, a reference image, an image/video file) — real
//     browser writes via records.changeRequest / bases.createChangeRequest
//     and Busabase Asset uploads.
//   - AI generation (character reference cards, storyboard images, draft
//     shot video, song draft) — the browser can only WRITE A REQUEST
//     (`*_status = "requested"`) onto the record; it can never hold the
//     image-API key or spawn the local LTX video process itself. A trusted
//     skill-root script (scripts/execute_generation_requests.mjs) is what
//     actually performs generation and flips status to "generated"/"blocked".
//     This mirrors the retired local app's agent_execution task queue
//     (queueAgentTask -> execute_agent_tasks.ts) one-for-one, just moved from
//     a local tasks.json to a status field on the owning Busabase record — no
//     separate decisions/tasks bucket, per the migration recipe.
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { resolveAssetUrls, uploadAsset } from "../mv-client.js?v=0.1.0";
import { attention, completeness, countBy, nextStep } from "../mv-model.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

// A deployed AirApp sits inside the Busabase review boundary; only a standalone
// run may merge its own writes. That is far too consequential to infer from the
// URL — see ../runtime.js.
import { isStandaloneLocalRuntime } from "../runtime.js";

export { isStandaloneLocalRuntime };

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), value]));

function parseJsonArray(text) {
  try {
    const value = JSON.parse(text || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function parseJsonObject(text) {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

let runtimeClient;
let runtimeBases = new Map();
let pendingSetupError = "";

async function ensureResources() {
  runtimeClient = runtimeClient || createRuntimeClient();
  if (!allowedReads.has("nodes.list") || !allowedReads.has("nodes.get")) {
    throw new Error("PROCEDURE_DENIED: nodes.list/nodes.get");
  }
  let resources = await inspectProvisionedResources(runtimeClient, appConfig);
  if (resources.folder && resources.missing.length === 0 && resources.repairs.length) {
    if (!allowedReads.has("bases.get") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: bases.get/nodes.updateMetadata");
    }
    resources = await provisionDeclaredResources(runtimeClient, appConfig);
  }
  if (!resources.folder || resources.missing.length) {
    if (pendingSetupError) throw new Error(pendingSetupError);
    const names = resources.missing.map((base) => base.name).join(", ");
    throw new Error(`SETUP_REQUIRED: ${names || appConfig.folder.name}`);
  }
  pendingSetupError = "";
  runtimeBases = new Map(resources.bases.map((base) => [base.key, base]));
  return resources;
}

function base(key) {
  const declared = runtimeBases.get(key);
  if (!declared) throw new Error(`SETUP_REQUIRED: ${key}`);
  return declared;
}

async function readAllRecords(key, { maxPages = 20 } = {}) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const rows = [];
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await runtimeClient.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  try {
    return await runtimeClient.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  const existing = await findRecord(key, idFieldSlug, idValue);
  const normalized = toBusabaseFields(fields);
  const autoMerge = isStandaloneLocalRuntime();
  if (!existing) {
    return runtimeClient.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: appConfig.appId,
      autoMerge,
    });
  }
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: normalized,
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
    autoMerge,
  });
}

async function readProjectRow() {
  const rows = await readAllRecords("project");
  return rows[0] || {};
}
async function readSettingsRow() {
  const rows = await readAllRecords("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

function projectFields(row) {
  return {
    project_id: row.project_id || "kelly-mv-project",
    song_title: row.song_title || "",
    song_artist: row.song_artist || "",
    song_audio_asset_id: row.song_audio_asset_id || "",
    song_duration_seconds: row.song_duration_seconds ?? 0,
    song_source: row.song_source || "",
    song_uploaded_at: row.song_uploaded_at || "",
    treatment_summary: row.treatment_summary || "",
    treatment_look: row.treatment_look || "",
    treatment_aspect_ratio: row.treatment_aspect_ratio || "16:9",
    updated_at: new Date().toISOString(),
  };
}

function characterFields(row) {
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
    reference_card_status: row.reference_card_status || "ready_to_generate",
    reference_card_prompt: row.reference_card_prompt || "",
    reference_card_asset_id: row.reference_card_asset_id || "",
    reference_card_generated_at: row.reference_card_generated_at || "",
    reference_card_generation_json: row.reference_card_generation_json || "{}",
    deleted: row.deleted || "false",
  };
}

function shotFields(row) {
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

// Collect every assetId referenced by the project so their download URLs can
// be resolved in one batch instead of once per thumbnail render.
function collectAssetIds({ projectRow, castRows, shotRows }) {
  const ids = [projectRow.song_audio_asset_id];
  for (const row of castRows) ids.push(row.reference_card_asset_id);
  for (const row of shotRows) {
    ids.push(row.image_asset_id, row.video_asset_id);
    for (const cand of parseJsonArray(row.image_candidates_json)) ids.push(cand.assetId);
    for (const cand of parseJsonArray(row.video_candidates_json)) ids.push(cand.assetId);
  }
  return ids.filter(Boolean);
}

function buildProject({ projectRow, settingsRow, castRows, shotRows, urlOf }) {
  const characters = castRows
    .filter((row) => row.deleted !== "true")
    .map((row) => ({
      id: row.character_id,
      name: row.name || "",
      role: row.role || "",
      status: row.status || "draft",
      actor_profile: row.actor_profile || "",
      character_card: {},
      visual: {
        front: row.visual_front || "",
        side: row.visual_side || "",
        back: row.visual_back || "",
        wardrobe: row.wardrobe || "",
        anchors: parseJsonArray(row.anchors_json),
        forbidden_drift: parseJsonArray(row.forbidden_drift_json),
      },
      reference_card: {
        status: row.reference_card_status || "draft",
        prompt: row.reference_card_prompt || "",
        image_asset: urlOf(row.reference_card_asset_id),
        generated_at: row.reference_card_generated_at || "",
        generation: parseJsonObject(row.reference_card_generation_json),
      },
    }));

  const shots = shotRows
    .filter((row) => row.deleted !== "true")
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
    .map((row) => ({
      id: row.shot_id,
      title: row.title || "",
      status: row.status || "draft",
      description: row.description || "",
      negative_prompt: row.negative_prompt || "",
      video_prompt: row.video_prompt || "",
      duration_seconds: Number(row.duration_seconds) || 8,
      characters: parseJsonArray(row.characters_json),
      image_asset: urlOf(row.image_asset_id),
      image_generated_at: row.image_generated_at || "",
      image_generation: parseJsonObject(row.image_generation_json),
      image_status: row.image_status || "draft",
      image_candidates: parseJsonArray(row.image_candidates_json).map((c) => ({
        assetId: c.assetId,
        path: urlOf(c.assetId),
        generated_at: c.generated_at,
        generation: c.generation || {},
      })),
      video_asset: urlOf(row.video_asset_id),
      video_generated_at: row.video_generated_at || "",
      video_generation: parseJsonObject(row.video_generation_json),
      video_status: row.video_status || "draft",
      video_candidates: parseJsonArray(row.video_candidates_json).map((c) => ({
        assetId: c.assetId,
        path: urlOf(c.assetId),
        generated_at: c.generated_at,
        generation: c.generation || {},
      })),
    }));

  return {
    project_id: projectRow.project_id || "kelly-mv-project",
    updated_at: projectRow.updated_at || "",
    song: {
      title: projectRow.song_title || "",
      artist: projectRow.song_artist || "",
      audio_asset: urlOf(projectRow.song_audio_asset_id),
      duration_seconds: Number(projectRow.song_duration_seconds) || 0,
      source: projectRow.song_source || "",
      uploaded_at: projectRow.song_uploaded_at || "",
    },
    treatment: {
      summary: projectRow.treatment_summary || "",
      look: projectRow.treatment_look || "",
      aspect_ratio: projectRow.treatment_aspect_ratio || "16:9",
    },
    characters,
    shots,
    _settings: {
      image_base_url: settingsRow.image_base_url || "",
      image_model: settingsRow.image_model || "",
      image_size: settingsRow.image_size || "",
      song_draft_backend: settingsRow.song_draft_backend || "songgeneration-v2-mlx",
      video_draft_backend: settingsRow.video_draft_backend || "ltx-video-mps",
    },
  };
}

function nextShotPosition(shotRows) {
  return shotRows.reduce((max, row) => Math.max(max, Number(row.position) || 0), 0) + 1;
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const [projectRow, settingsRow, castRows, shotRows] = await Promise.all([
      readProjectRow(),
      readSettingsRow(),
      readAllRecords("cast"),
      readAllRecords("shots"),
    ]);
    const assetIds = collectAssetIds({ projectRow, castRows, shotRows });
    const urlMap = await resolveAssetUrls(runtimeClient, assetIds);
    const urlOf = (assetId) => (assetId ? urlMap.get(assetId) || "" : "");
    const project = buildProject({ projectRow, settingsRow, castRows, shotRows, urlOf });
    return {
      app: "kelly-mv",
      demo: false,
      data_provider: "busabase",
      onboarding: { completed: true, source: "busabase" },
      lock: null,
      config_summary: { config_path: "busabase:workspace/kelly-mv", is_example: false },
      project,
      projects: [{ id: project.project_id, title: project.song.title, artist: project.song.artist, mode: "" }],
      active_project_id: project.project_id,
      counts: { characters: countBy(project.characters), shots: countBy(project.shots), tasks: {} },
      totals: { characters: project.characters.length, shots: project.shots.length, tasks: 0 },
      completeness: completeness(project),
      attention: attention(project),
      next_step: nextStep(project),
    };
  },

  async saveTreatment({ summary = "", look = "", aspect_ratio = "16:9" } = {}) {
    await ensureResources();
    const current = await readProjectRow();
    const fields = {
      ...projectFields(current),
      treatment_summary: summary,
      treatment_look: look,
      treatment_aspect_ratio: aspect_ratio,
    };
    await upsert("project", "project-id", fields.project_id, fields, "Update MV concept");
    return { ok: true };
  },

  async saveSongMeta({ title = "", artist = "" } = {}) {
    await ensureResources();
    const current = await readProjectRow();
    const fields = { ...projectFields(current), song_title: title, song_artist: artist };
    await upsert("project", "project-id", fields.project_id, fields, "Update song metadata");
    return { ok: true };
  },

  async uploadSong(file, { title = "", artist = "" } = {}) {
    await ensureResources();
    const audio = document.createElement("audio");
    const durationPromise = new Promise((resolve) => {
      audio.preload = "metadata";
      audio.onloadedmetadata = () => resolve(audio.duration || 0);
      audio.onerror = () => resolve(0);
      audio.src = URL.createObjectURL(file);
    });
    const [{ assetId }, durationSeconds] = await Promise.all([
      uploadAsset(runtimeClient, file, { context: "kelly-mv/song" }),
      durationPromise,
    ]);
    URL.revokeObjectURL(audio.src);
    const current = await readProjectRow();
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const fields = {
      ...projectFields(current),
      song_title: title || current.song_title || baseName,
      song_artist: artist || current.song_artist || "",
      song_audio_asset_id: assetId,
      song_duration_seconds: Math.round(durationSeconds) || 0,
      song_source: "uploaded",
      song_uploaded_at: new Date().toISOString(),
    };
    await upsert("project", "project-id", fields.project_id, fields, "Upload song");
    return { ok: true };
  },

  async saveCharacter(character = {}) {
    await ensureResources();
    const id = String(character.id || "");
    if (!id) throw new Error("Character id is required");
    const existing = await findRecord("cast", "character-id", id);
    const currentFields = existing ? normalizeFields(existing.headCommit?.fields || existing.fields) : {};
    const visual = character.visual || {};
    const fields = {
      ...characterFields(currentFields),
      character_id: id,
      name: character.name ?? currentFields.name ?? "",
      role: character.role ?? currentFields.role ?? "",
      status: character.status ?? currentFields.status ?? "draft",
      actor_profile: character.actor_profile ?? currentFields.actor_profile ?? "",
      visual_front: visual.front ?? currentFields.visual_front ?? "",
      visual_side: visual.side ?? currentFields.visual_side ?? "",
      visual_back: visual.back ?? currentFields.visual_back ?? "",
      wardrobe: visual.wardrobe ?? currentFields.wardrobe ?? "",
      anchors_json: JSON.stringify(visual.anchors || parseJsonArray(currentFields.anchors_json)),
      forbidden_drift_json: JSON.stringify(
        visual.forbidden_drift || parseJsonArray(currentFields.forbidden_drift_json),
      ),
      reference_card_prompt: character.reference_card?.prompt ?? currentFields.reference_card_prompt ?? "",
    };
    await upsert("cast", "character-id", id, fields, `Save character ${id}`);
    return { ok: true };
  },

  async deleteCharacter(id) {
    await ensureResources();
    const existing = await findRecord("cast", "character-id", id);
    if (!existing) return { ok: true };
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    await upsert(
      "cast",
      "character-id",
      id,
      { ...characterFields(currentFields), character_id: id, deleted: "true" },
      `Delete character ${id}`,
    );
    return { ok: true };
  },

  // Writes a generation REQUEST only — see the module header comment for why
  // actual generation is a trusted script's job.
  async requestCharacterCardGeneration(id) {
    await ensureResources();
    const existing = await findRecord("cast", "character-id", id);
    if (!existing) throw new Error(`Unknown character: ${id}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    await upsert(
      "cast",
      "character-id",
      id,
      { ...characterFields(currentFields), character_id: id, reference_card_status: "requested" },
      `Request reference card generation for ${id}`,
    );
    return { ok: true };
  },

  async saveShot(shot = {}) {
    await ensureResources();
    const id = String(shot.id || "");
    if (!id) throw new Error("Shot id is required");
    const shotRows = await readAllRecords("shots");
    const existingRow = shotRows.find((row) => row.shot_id === id);
    const fields = {
      ...shotFields(existingRow || {}),
      shot_id: id,
      position: existingRow ? existingRow.position : nextShotPosition(shotRows),
      title: shot.title ?? existingRow?.title ?? "",
      description: shot.description ?? existingRow?.description ?? "",
      negative_prompt: shot.negative_prompt ?? existingRow?.negative_prompt ?? "",
      video_prompt: shot.video_prompt ?? existingRow?.video_prompt ?? "",
      duration_seconds: Number(shot.duration_seconds) || Number(existingRow?.duration_seconds) || 8,
      characters_json: JSON.stringify(shot.characters || parseJsonArray(existingRow?.characters_json)),
    };
    await upsert("shots", "shot-id", id, fields, `Save shot ${id}`);
    return { ok: true };
  },

  async deleteShot(id) {
    await ensureResources();
    const existing = await findRecord("shots", "shot-id", id);
    if (!existing) return { ok: true };
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    await upsert(
      "shots",
      "shot-id",
      id,
      { ...shotFields(currentFields), shot_id: id, deleted: "true" },
      `Delete shot ${id}`,
    );
    return { ok: true };
  },

  async requestStoryboardImageGeneration(shotId) {
    await ensureResources();
    const existing = await findRecord("shots", "shot-id", shotId);
    if (!existing) throw new Error(`Unknown shot: ${shotId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    await upsert(
      "shots",
      "shot-id",
      shotId,
      { ...shotFields(currentFields), shot_id: shotId, image_status: "requested" },
      `Request storyboard image generation for ${shotId}`,
    );
    return { ok: true };
  },

  async requestShotVideoGeneration(shotId) {
    await ensureResources();
    const existing = await findRecord("shots", "shot-id", shotId);
    if (!existing) throw new Error(`Unknown shot: ${shotId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    await upsert(
      "shots",
      "shot-id",
      shotId,
      { ...shotFields(currentFields), shot_id: shotId, video_status: "requested" },
      `Request draft video generation for ${shotId}`,
    );
    return { ok: true };
  },

  async uploadShotAsset(shotId, kind, file) {
    await ensureResources();
    const { assetId } = await uploadAsset(runtimeClient, file, { context: `kelly-mv/shot-${kind}` });
    const existing = await findRecord("shots", "shot-id", shotId);
    if (!existing) throw new Error(`Unknown shot: ${shotId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    const generatedAt = new Date().toISOString();
    const generation = { mode: "upload", source: file.name || "" };
    const isVideo = kind === "video";
    const candidatesKey = isVideo ? "video_candidates_json" : "image_candidates_json";
    const prior = parseJsonArray(currentFields[candidatesKey]);
    const candidates = [...prior, { assetId, generated_at: generatedAt, generation }];
    const fields = {
      ...shotFields(currentFields),
      shot_id: shotId,
      [candidatesKey]: JSON.stringify(candidates),
      ...(isVideo
        ? {
            video_asset_id: assetId,
            video_generated_at: generatedAt,
            video_generation_json: JSON.stringify(generation),
            video_status: "uploaded",
          }
        : {
            image_asset_id: assetId,
            image_generated_at: generatedAt,
            image_generation_json: JSON.stringify(generation),
            image_status: "uploaded",
          }),
    };
    await upsert("shots", "shot-id", shotId, fields, `Upload ${kind} for shot ${shotId}`);
    return { ok: true };
  },

  async setShotActive(shotId, kind, assetId) {
    await ensureResources();
    const existing = await findRecord("shots", "shot-id", shotId);
    if (!existing) throw new Error(`Unknown shot: ${shotId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    const isVideo = kind === "video";
    const candidates = parseJsonArray(currentFields[isVideo ? "video_candidates_json" : "image_candidates_json"]);
    const match = candidates.find((c) => c.assetId === assetId);
    if (!match) throw new Error("该候选不存在，无法设为选用。");
    const fields = {
      ...shotFields(currentFields),
      shot_id: shotId,
      ...(isVideo
        ? {
            video_asset_id: match.assetId,
            video_generated_at: match.generated_at,
            video_generation_json: JSON.stringify(match.generation || {}),
          }
        : {
            image_asset_id: match.assetId,
            image_generated_at: match.generated_at,
            image_generation_json: JSON.stringify(match.generation || {}),
          }),
    };
    await upsert("shots", "shot-id", shotId, fields, `Select active ${kind} for shot ${shotId}`);
    return { ok: true };
  },

  async saveImageConfig({ base_url = "", model = "", size = "" } = {}) {
    await ensureResources();
    const current = await readSettingsRow();
    const fields = {
      record_id: "config",
      image_base_url: base_url || current.image_base_url || "",
      image_model: model || current.image_model || "gpt-image-2",
      image_size: size || current.image_size || "1024x1024",
      song_draft_backend: current.song_draft_backend || "songgeneration-v2-mlx",
      video_draft_backend: current.video_draft_backend || "ltx-video-mps",
      video_width: current.video_width ?? 512,
      video_height: current.video_height ?? 288,
      video_fps: current.video_fps ?? 24,
      video_max_frames: current.video_max_frames ?? 121,
    };
    await upsert("settings", "record-id", "config", fields, "Update image generation settings");
    return { base_url: fields.image_base_url, model: fields.image_model, size: fields.image_size, has_api_key: false };
  },

  async provisionResources() {
    if (!allowedSetup.has("nodes.createChangeRequest") || !allowedSetup.has("nodes.updateMetadata")) {
      throw new Error("PROCEDURE_DENIED: nodes.createChangeRequest/nodes.updateMetadata");
    }
    const client = runtimeClient || createRuntimeClient();
    try {
      return await provisionDeclaredResources(client, appConfig);
    } catch (error) {
      if (String(error?.message || error).startsWith("SETUP_PENDING:")) {
        pendingSetupError = String(error.message);
      }
      throw error;
    }
  },
};
