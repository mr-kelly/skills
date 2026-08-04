// Reads/writes the operator-provisioned Kelly Drama Busabase workspace (one
// Folder, 7 Bases: project/settings/characters/relationships/episodes/shots/
// tasks) through js/busabase-client.js + js/drama-client.js (Asset upload/
// read) and normalizes with js/drama-model.js. Mirrors Kelly MV's
// busabase-provider.js one-for-one (this skill's closest architectural twin)
// — see that module's header comment for the write-scope rationale.
//
// Write scope, faithful to what the browser genuinely does today vs. what
// only a trusted process can do:
//   - Editing text fields (series bible, visual bible, character cards,
//     relationships, episode beats, shot production sheet) — real browser
//     writes via records.changeRequest / bases.createChangeRequest.
//   - AI generation (character reference cards, character reference voices,
//     storyboard images, shot videos) — the browser can only WRITE A REQUEST
//     (`*_status = "requested"`) onto the record; it can never hold the
//     image-API key, spawn the local Qwen3-TTS process, or spawn the local
//     LTX-Video process itself. A trusted skill-root script
//     (scripts/execute_generation_requests.mjs) is what actually performs
//     generation and flips status to "generated"/"blocked". This mirrors the
//     retired local app's agent_execution task queue (queueAgentTask ->
//     execute_agent_tasks.ts) one-for-one, just moved from a local
//     agent_tasks.json to a status field on the owning Busabase record — no
//     separate decisions/tasks bucket, per the migration recipe. (The
//     "tasks" Base here is a DIFFERENT, still-real thing: freeform human/@ai
//     review notes the retired app also modeled as its own collection, kept
//     as its own Base.)
//   - Reading the paired HyperFrame project (a local filesystem path on the
//     operator's machine — hyperframes.json/design.md/composition HTML) can
//     never happen in-browser at all, in the old app OR this one; it is a
//     trusted skill-root script (scripts/read_hyperframe_status.mjs) that
//     writes a cached status snapshot onto the project record. The browser
//     only ever displays that cached snapshot.
//   - Binary uploads: unlike Kelly MV (which lets a human upload an MP3 or a
//     reference image/video directly), the retired Kelly Drama app's UI had
//     NO manual asset-upload affordance at all — every image/video/voice
//     asset is either AI-generated (via a "requested" status flip) or absent.
//     This provider has no uploadX() methods for exactly that reason.
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";
import { resolveAssetUrls } from "../drama-client.js?v=0.1.0";
import { attention, completeness, countBy, slug } from "../drama-model.js?v=0.1.0";
import { inspectProvisionedResources, provisionDeclaredResources } from "../resource-provisioning.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);
const allowedSetup = new Set(appConfig.permissions.setupProcedures);
const allowedWrites = new Set(appConfig.permissions.writeProcedures);

export const isStandaloneLocalRuntime = () => {
  const host = window.location.hostname;
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(host) || host.endsWith(".localhost");
  const busabaseHosted = window.self !== window.top || window.location.pathname.startsWith("/api/airapp-preview/");
  return loopback && !busabaseHosted;
};

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key.replaceAll("-", "_"), value]));
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

// Ported verbatim from the retired app/server/hono.ts's idFor().
function idFor(kind, item) {
  if (item.id) return String(item.id);
  const prefix =
    { characters: "char", relationships: "rel", episodes: "ep", shots: "shot", tasks: "task" }[kind] || "item";
  const base = item.name || item.title || item.type || Date.now();
  return `${prefix}-${slug(base)}`;
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
      const fields = normalizeFields(record.headCommit?.fields || record.fields);
      fields.__recordId = record.id;
      fields.__headCommitId = record.headCommitId || record.headCommit?.id;
      rows.push(fields);
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

// ---- field shapes (row <-> field defaults) ----

function projectFields(row = {}) {
  return {
    project_id: row.project_id || "kelly-drama-project",
    title: row.title || "",
    logline: row.logline || "",
    genre: row.genre || "",
    platform: row.platform || "",
    format: row.format || "",
    tone: row.tone || "",
    audience: row.audience || "",
    hook_rules_json: row.hook_rules_json || "[]",
    world_rules_json: row.world_rules_json || "[]",
    hyperframe_project_path: row.hyperframe_project_path || "",
    hyperframe_status_json: row.hyperframe_status_json || "{}",
    hyperframe_status_updated_at: row.hyperframe_status_updated_at || "",
    visual_format_note: row.visual_format_note || "",
    visual_realism_target: row.visual_realism_target || "",
    visual_cinematography: row.visual_cinematography || "",
    visual_color_palette: row.visual_color_palette || "",
    visual_period_detail: row.visual_period_detail || "",
    visual_aspect_ratio: row.visual_aspect_ratio || "",
    visual_orientation: row.visual_orientation || "",
    visual_style_medium: row.visual_style_medium || "",
    visual_background_refs_json: row.visual_background_refs_json || "[]",
    updated_at: new Date().toISOString(),
  };
}

function characterFields(row = {}) {
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
    reference_card_status: row.reference_card_status || "ready_to_generate",
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

function relationshipFields(row = {}) {
  return {
    relationship_id: row.relationship_id,
    from_character_id: row.from_character_id || "",
    to_character_id: row.to_character_id || "",
    type: row.type || "",
    public_status: row.public_status || "",
    hidden_truth: row.hidden_truth || "",
    power_dynamic: row.power_dynamic || "",
    emotional_temperature: row.emotional_temperature || "",
    conflict: row.conflict || "",
    evidence_json: row.evidence_json || "[]",
    deleted: row.deleted || "false",
  };
}

function episodeFields(row = {}) {
  return {
    episode_id: row.episode_id,
    number: row.number ?? 0,
    title: row.title || "",
    status: row.status || "draft",
    hyperframe_composition: row.hyperframe_composition || "",
    hyperframe_video_asset: row.hyperframe_video_asset || "",
    summary: row.summary || "",
    promise: row.promise || "",
    a_plot: row.a_plot || "",
    b_plot: row.b_plot || "",
    cliffhanger: row.cliffhanger || "",
    beats_json: row.beats_json || "[]",
    deleted: row.deleted || "false",
  };
}

function shotFields(row = {}) {
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

function taskFields(row = {}) {
  return {
    task_id: row.task_id,
    kind: row.kind || "episode",
    target_id: row.target_id || "",
    status: row.status || "needs_review",
    title: row.title || "",
    note: row.note || "",
    deleted: row.deleted || "false",
  };
}

// ---- read: rows -> project ----

function collectAssetIds({ projectRow, characterRows, shotRows }) {
  const ids = [];
  for (const bg of parseJsonArray(projectRow.visual_background_refs_json)) ids.push(bg.assetId);
  for (const row of characterRows) {
    ids.push(row.reference_card_asset_id, row.voice_reference_asset_id);
    for (const cand of parseJsonArray(row.voice_candidates_json)) ids.push(cand.assetId);
  }
  for (const row of shotRows) {
    ids.push(row.image_asset_id, row.video_asset_id);
    for (const cand of parseJsonArray(row.image_candidates_json)) ids.push(cand.assetId);
    for (const cand of parseJsonArray(row.video_candidates_json)) ids.push(cand.assetId);
  }
  return ids.filter(Boolean);
}

function buildSeries(projectRow, urlOf) {
  return {
    title: projectRow.title || "",
    logline: projectRow.logline || "",
    genre: projectRow.genre || "",
    platform: projectRow.platform || "",
    format: projectRow.format || "",
    tone: projectRow.tone || "",
    audience: projectRow.audience || "",
    hook_rules: parseJsonArray(projectRow.hook_rules_json),
    world_rules: parseJsonArray(projectRow.world_rules_json),
    hyperframe_project_path: projectRow.hyperframe_project_path || "",
    hyperframe_status: parseJsonObject(projectRow.hyperframe_status_json),
    hyperframe_status_updated_at: projectRow.hyperframe_status_updated_at || "",
    visual_bible: {
      format_note: projectRow.visual_format_note || "",
      realism_target: projectRow.visual_realism_target || "",
      cinematography: projectRow.visual_cinematography || "",
      color_palette: projectRow.visual_color_palette || "",
      period_detail: projectRow.visual_period_detail || "",
      aspect_ratio: projectRow.visual_aspect_ratio || "",
      orientation: projectRow.visual_orientation || "",
      style_medium: projectRow.visual_style_medium || "",
      background_reference_assets: parseJsonArray(projectRow.visual_background_refs_json).map((bg) => ({
        id: bg.id || "",
        title: bg.title || "",
        scene: bg.scene || "",
        path: urlOf(bg.assetId),
        assetId: bg.assetId,
        generated_at: bg.generated_at || "",
        model: bg.model || "",
        size: bg.size || "",
      })),
    },
  };
}

function buildCharacter(row, urlOf) {
  return {
    id: row.character_id,
    name: row.name || "",
    role: row.role || "",
    status: row.status || "draft",
    actor_profile: row.actor_profile || "",
    character_card: {
      identity: row.card_identity || "",
      motivation: row.card_motivation || "",
      wound: row.card_wound || "",
      secret: row.card_secret || "",
      arc: row.card_arc || "",
      voice: row.card_voice || "",
    },
    visual: {
      front: row.visual_front || "",
      side: row.visual_side || "",
      back: row.visual_back || "",
      wardrobe: row.visual_wardrobe || "",
      anchors: parseJsonArray(row.visual_anchors_json),
      forbidden_drift: parseJsonArray(row.visual_forbidden_drift_json),
    },
    voice_profile: {
      type: row.voice_type || "",
      pace: row.voice_pace || "",
      accent: row.voice_accent || "",
      signature: row.voice_signature || "",
      casting_reference: row.voice_casting_reference || "",
      sample_script: row.voice_sample_script || "",
    },
    reference_card: {
      status: row.reference_card_status || "ready_to_generate",
      purpose: row.reference_card_purpose || "",
      prompt: row.reference_card_prompt || "",
      image_asset: urlOf(row.reference_card_asset_id),
      generated_at: row.reference_card_generated_at || "",
      generation: parseJsonObject(row.reference_card_generation_json),
    },
    voice_reference: {
      status: row.voice_reference_status || "planned",
      provider: row.voice_reference_provider || "",
      asset: urlOf(row.voice_reference_asset_id),
      generated_at: row.voice_reference_generated_at || "",
      generation: parseJsonObject(row.voice_reference_generation_json),
    },
    voice_candidates: parseJsonArray(row.voice_candidates_json).map((c) => ({
      assetId: c.assetId,
      path: urlOf(c.assetId),
      generated_at: c.generated_at,
      generation: c.generation || {},
    })),
  };
}

function buildRelationship(row) {
  return {
    id: row.relationship_id,
    from: row.from_character_id || "",
    to: row.to_character_id || "",
    type: row.type || "",
    public_status: row.public_status || "",
    hidden_truth: row.hidden_truth || "",
    power_dynamic: row.power_dynamic || "",
    emotional_temperature: row.emotional_temperature || "",
    conflict: row.conflict || "",
    evidence: parseJsonArray(row.evidence_json),
  };
}

function buildEpisode(row) {
  return {
    id: row.episode_id,
    number: Number(row.number) || 0,
    title: row.title || "",
    status: row.status || "draft",
    hyperframe_composition: row.hyperframe_composition || "",
    hyperframe_video_asset: row.hyperframe_video_asset || "",
    summary: row.summary || "",
    promise: row.promise || "",
    a_plot: row.a_plot || "",
    b_plot: row.b_plot || "",
    cliffhanger: row.cliffhanger || "",
    beats: parseJsonArray(row.beats_json),
  };
}

function buildShot(row, urlOf) {
  return {
    id: row.shot_id,
    episode_id: row.episode_id || "",
    beat_id: row.beat_id || "",
    title: row.title || "",
    status: row.status || "draft",
    duration_seconds: Number(row.duration_seconds) || 8,
    duration_preset: row.duration_preset || (row.duration_seconds ? `${row.duration_seconds}s` : ""),
    aspect_ratio: row.aspect_ratio || "",
    emotion: row.emotion || "",
    shot_size: row.shot_size || "",
    camera_angle: row.camera_angle || "",
    camera_movement: row.camera_movement || "",
    lens: row.lens || "",
    characters: parseJsonArray(row.characters_json),
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
    silent: row.silent === "true",
    audio: parseJsonObject(row.audio_json),
    srt: parseJsonArray(row.srt_json),
    continuity: parseJsonObject(row.continuity_json),
    image_asset: urlOf(row.image_asset_id),
    image_status: row.image_status || "draft",
    image_generated_at: row.image_generated_at || "",
    image_generation: parseJsonObject(row.image_generation_json),
    image_candidates: parseJsonArray(row.image_candidates_json).map((c) => ({
      assetId: c.assetId,
      path: urlOf(c.assetId),
      generated_at: c.generated_at,
      generation: c.generation || {},
    })),
    video_asset: urlOf(row.video_asset_id),
    video_status: row.video_status || "draft",
    video_generated_at: row.video_generated_at || "",
    video_generation: parseJsonObject(row.video_generation_json),
    video_candidates: parseJsonArray(row.video_candidates_json).map((c) => ({
      assetId: c.assetId,
      path: urlOf(c.assetId),
      generated_at: c.generated_at,
      generation: c.generation || {},
    })),
  };
}

function buildTask(row) {
  return {
    id: row.task_id,
    kind: row.kind || "episode",
    target_id: row.target_id || "",
    status: row.status || "needs_review",
    title: row.title || "",
    note: row.note || "",
  };
}

function nextShotPosition(shotRows) {
  return shotRows.reduce((max, row) => Math.max(max, Number(row.position) || 0), 0) + 1;
}

async function readProjectRow() {
  const rows = await readAllRecords("project");
  return rows[0] || {};
}
async function readSettingsRow() {
  const rows = await readAllRecords("settings");
  return rows.find((row) => row.record_id === "config") || {};
}

function settingsPayload(row = {}) {
  return {
    image_base_url: row.image_base_url || "",
    image_model: row.image_model || "gpt-image-2",
    image_size: row.image_size || "1024x1024",
    video_draft_backend: row.video_draft_backend || "ltx-video-mps",
    video_width: Number(row.video_width) || 512,
    video_height: Number(row.video_height) || 288,
    video_fps: Number(row.video_fps) || 24,
    video_max_frames: Number(row.video_max_frames) || 121,
    video_prod_backend: row.video_prod_backend || "seedance-2.0-ark",
    video_ark_base_url: row.video_ark_base_url || "",
    video_ark_model: row.video_ark_model || "",
    video_prod_resolution: row.video_prod_resolution || "720p",
    video_prod_ratio: row.video_prod_ratio || "16:9",
    video_prod_watermark: row.video_prod_watermark === "true",
    video_generate_audio: row.video_generate_audio !== "false",
    tts_backend: row.tts_backend || "qwen3-tts-mlx",
    tts_model: row.tts_model || "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit",
  };
}

async function buildFullProject() {
  const [projectRow, settingsRow, characterRows, relationshipRows, episodeRows, shotRows, taskRows] = await Promise.all(
    [
      readProjectRow(),
      readSettingsRow(),
      readAllRecords("characters"),
      readAllRecords("relationships"),
      readAllRecords("episodes"),
      readAllRecords("shots"),
      readAllRecords("tasks"),
    ],
  );
  const assetIds = collectAssetIds({ projectRow, characterRows, shotRows });
  const urlMap = await resolveAssetUrls(runtimeClient, assetIds);
  const urlOf = (assetId) => (assetId ? urlMap.get(assetId) || "" : "");

  const characters = characterRows.filter((row) => row.deleted !== "true").map((row) => buildCharacter(row, urlOf));
  const relationships = relationshipRows.filter((row) => row.deleted !== "true").map(buildRelationship);
  const episodes = episodeRows
    .filter((row) => row.deleted !== "true")
    .map(buildEpisode)
    .sort((a, b) => (a.number || 0) - (b.number || 0));
  const shots = shotRows
    .filter((row) => row.deleted !== "true")
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
    .map((row) => buildShot(row, urlOf));
  const tasks = taskRows.filter((row) => row.deleted !== "true").map(buildTask);

  const project = {
    project_id: projectRow.project_id || "kelly-drama-project",
    updated_at: projectRow.updated_at || "",
    series: buildSeries(projectRow, urlOf),
    characters,
    relationships,
    episodes,
    shots,
    tasks,
    _settings: settingsPayload(settingsRow),
  };
  return project;
}

function fullStatePayload(project) {
  return {
    app: "kelly-drama",
    demo: false,
    data_provider: "busabase",
    onboarding: { completed: true, source: "busabase" },
    lock: { locked: false },
    config_summary: { config_path: "busabase:workspace/kelly-drama", is_example: false },
    project,
    projects: [
      {
        id: project.project_id,
        title: project.series?.title || "",
        genre: project.series?.genre || "",
        format: project.series?.format || "",
      },
    ],
    active_project_id: project.project_id,
    counts: {
      characters: countBy(project.characters),
      episodes: countBy(project.episodes),
      shots: countBy(project.shots),
      tasks: countBy(project.tasks),
    },
    totals: {
      characters: (project.characters || []).length,
      relationships: (project.relationships || []).length,
      episodes: (project.episodes || []).length,
      shots: (project.shots || []).length,
      tasks: (project.tasks || []).length,
    },
    completeness: completeness(project),
    attention: attention(project),
  };
}

// ---- generic collection dispatch (mirrors the retired hono routes' single
// POST /api/:kind/:id? handler, now against per-kind field builders) ----

const COLLECTIONS = {
  characters: {
    baseKey: "characters",
    idField: "character-id",
    idKey: "character_id",
    fields: characterFields,
    build: buildCharacter,
  },
  relationships: {
    baseKey: "relationships",
    idField: "relationship-id",
    idKey: "relationship_id",
    fields: relationshipFields,
    build: buildRelationship,
  },
  episodes: {
    baseKey: "episodes",
    idField: "episode-id",
    idKey: "episode_id",
    fields: episodeFields,
    build: buildEpisode,
  },
  shots: { baseKey: "shots", idField: "shot-id", idKey: "shot_id", fields: shotFields, build: buildShot },
  tasks: { baseKey: "tasks", idField: "task-id", idKey: "task_id", fields: taskFields, build: buildTask },
};

function payloadToRow(kind, payload = {}) {
  if (kind === "characters") {
    const card = payload.character_card || {};
    const visual = payload.visual || {};
    const vp = payload.voice_profile || {};
    return {
      name: payload.name,
      role: payload.role,
      status: payload.status,
      actor_profile: payload.actor_profile,
      card_identity: card.identity,
      card_motivation: card.motivation,
      card_wound: card.wound,
      card_secret: card.secret,
      card_arc: card.arc,
      card_voice: card.voice,
      visual_front: visual.front,
      visual_side: visual.side,
      visual_back: visual.back,
      visual_wardrobe: visual.wardrobe,
      visual_anchors_json: JSON.stringify(visual.anchors || []),
      visual_forbidden_drift_json: JSON.stringify(visual.forbidden_drift || []),
      voice_type: vp.type,
      voice_pace: vp.pace,
      voice_accent: vp.accent,
      voice_signature: vp.signature,
      voice_casting_reference: vp.casting_reference,
      voice_sample_script: vp.sample_script,
    };
  }
  if (kind === "relationships") {
    return {
      from_character_id: payload.from,
      to_character_id: payload.to,
      type: payload.type,
      public_status: payload.public_status,
      hidden_truth: payload.hidden_truth,
      power_dynamic: payload.power_dynamic,
      emotional_temperature: payload.emotional_temperature,
      conflict: payload.conflict,
      evidence_json: JSON.stringify(payload.evidence || []),
    };
  }
  if (kind === "episodes") {
    return {
      number: payload.number,
      title: payload.title,
      status: payload.status,
      hyperframe_composition: payload.hyperframe_composition,
      hyperframe_video_asset: payload.hyperframe_video_asset,
      summary: payload.summary,
      promise: payload.promise,
      a_plot: payload.a_plot,
      b_plot: payload.b_plot,
      cliffhanger: payload.cliffhanger,
      beats_json: JSON.stringify(payload.beats || []),
    };
  }
  if (kind === "shots") {
    const row = {
      episode_id: payload.episode_id,
      beat_id: payload.beat_id,
      title: payload.title,
      status: payload.status,
      shot_size: payload.shot_size,
      camera_angle: payload.camera_angle,
      camera_movement: payload.camera_movement,
      lens: payload.lens,
      emotion: payload.emotion,
      characters_json: JSON.stringify(payload.characters || []),
      composition: payload.composition,
      camera: payload.camera,
      setting: payload.setting,
      lighting: payload.lighting,
      action: payload.action,
      prompt: payload.prompt,
      video_prompt: payload.video_prompt,
      negative_prompt: payload.negative_prompt,
      transition_in: payload.transition_in,
      transition_out: payload.transition_out,
    };
    if (payload.duration_seconds) {
      row.duration_seconds = payload.duration_seconds;
      row.duration_preset = payload.duration_preset || `${payload.duration_seconds}s`;
    }
    return row;
  }
  // tasks
  return {
    kind: payload.kind,
    target_id: payload.target_id,
    status: payload.status,
    title: payload.title,
    note: payload.note,
  };
}

export const busabaseProvider = {
  kind: "busabase",

  async getState() {
    await ensureResources();
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async saveSeries(series = {}) {
    await ensureResources();
    const current = await readProjectRow();
    const fields = {
      ...projectFields(current),
      title: series.title || "",
      genre: series.genre || "",
      platform: series.platform || "",
      format: series.format || "",
      tone: series.tone || "",
      audience: series.audience || "",
      hyperframe_project_path: series.hyperframe_project_path || "",
      logline: series.logline || "",
      hook_rules_json: JSON.stringify(series.hook_rules || []),
      world_rules_json: JSON.stringify(series.world_rules || []),
    };
    await upsert("project", "project-id", fields.project_id, fields, "Update series bible");
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async saveItem(kindKey, payload = {}) {
    await ensureResources();
    const spec = COLLECTIONS[kindKey];
    if (!spec) throw new Error(`Unknown collection: ${kindKey}`);
    const id = idForPayload(kindKey, payload);
    const rows = await readAllRecords(spec.baseKey);
    const existingRow = rows.find((row) => row[spec.idKey] === id);
    const fields = { ...spec.fields(existingRow || {}), [spec.idKey]: id, ...payloadToRow(kindKey, payload) };
    if (kindKey === "shots" && !existingRow) fields.position = nextShotPosition(rows);
    await upsert(spec.baseKey, spec.idField, id, fields, `Save ${kindKey} ${id}`);
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async deleteItem(kindKey, id) {
    await ensureResources();
    const spec = COLLECTIONS[kindKey];
    if (!spec) throw new Error(`Unknown collection: ${kindKey}`);
    const existing = await findRecord(spec.baseKey, spec.idField, id);
    if (existing) {
      const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
      await upsert(
        spec.baseKey,
        spec.idField,
        id,
        { ...spec.fields(currentFields), [spec.idKey]: id, deleted: "true" },
        `Delete ${kindKey} ${id}`,
      );
    }
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async setShotActive(shotId, kindOfAsset, assetId) {
    await ensureResources();
    const existing = await findRecord("shots", "shot-id", shotId);
    if (!existing) throw new Error(`Unknown shot: ${shotId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    const isVideo = kindOfAsset === "video";
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
    await upsert("shots", "shot-id", shotId, fields, `Select active ${kindOfAsset} for shot ${shotId}`);
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async setCharacterVoiceActive(characterId, assetId) {
    await ensureResources();
    const existing = await findRecord("characters", "character-id", characterId);
    if (!existing) throw new Error(`Unknown character: ${characterId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    const candidates = parseJsonArray(currentFields.voice_candidates_json);
    const match = candidates.find((c) => c.assetId === assetId);
    if (!match) throw new Error("该候选不存在，无法设为选用。");
    const fields = {
      ...characterFields(currentFields),
      character_id: characterId,
      voice_reference_status: "generated",
      voice_reference_asset_id: match.assetId,
      voice_reference_generated_at: match.generated_at,
      voice_reference_generation_json: JSON.stringify(match.generation || {}),
    };
    await upsert("characters", "character-id", characterId, fields, `Select active voice for ${characterId}`);
    const project = await buildFullProject();
    return fullStatePayload(project);
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
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async requestShotVideoGeneration(shotId, backend = "seedance") {
    await ensureResources();
    const existing = await findRecord("shots", "shot-id", shotId);
    if (!existing) throw new Error(`Unknown shot: ${shotId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    await upsert(
      "shots",
      "shot-id",
      shotId,
      { ...shotFields(currentFields), shot_id: shotId, video_status: `requested:${backend}` },
      `Request draft video generation for ${shotId}`,
    );
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async requestCharacterVoiceGeneration(characterId) {
    await ensureResources();
    const existing = await findRecord("characters", "character-id", characterId);
    if (!existing) throw new Error(`Unknown character: ${characterId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    await upsert(
      "characters",
      "character-id",
      characterId,
      { ...characterFields(currentFields), character_id: characterId, voice_reference_status: "requested" },
      `Request reference voice generation for ${characterId}`,
    );
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async requestCharacterCardGeneration(characterId) {
    await ensureResources();
    const existing = await findRecord("characters", "character-id", characterId);
    if (!existing) throw new Error(`Unknown character: ${characterId}`);
    const currentFields = normalizeFields(existing.headCommit?.fields || existing.fields);
    await upsert(
      "characters",
      "character-id",
      characterId,
      { ...characterFields(currentFields), character_id: characterId, reference_card_status: "requested" },
      `Request reference card generation for ${characterId}`,
    );
    const project = await buildFullProject();
    return fullStatePayload(project);
  },

  async saveImageConfig({ base_url = "", model = "", size = "" } = {}) {
    await ensureResources();
    const current = await readSettingsRow();
    const fields = {
      record_id: "config",
      image_base_url: base_url || current.image_base_url || "",
      image_model: model || current.image_model || "gpt-image-2",
      image_size: size || current.image_size || "1024x1024",
      video_draft_backend: current.video_draft_backend || "ltx-video-mps",
      video_width: current.video_width ?? 512,
      video_height: current.video_height ?? 288,
      video_fps: current.video_fps ?? 24,
      video_max_frames: current.video_max_frames ?? 121,
      video_prod_backend: current.video_prod_backend || "seedance-2.0-ark",
      video_ark_base_url: current.video_ark_base_url || "",
      video_ark_model: current.video_ark_model || "",
      video_prod_resolution: current.video_prod_resolution || "720p",
      video_prod_ratio: current.video_prod_ratio || "16:9",
      video_prod_watermark: current.video_prod_watermark || "false",
      video_generate_audio: current.video_generate_audio || "true",
      tts_backend: current.tts_backend || "qwen3-tts-mlx",
      tts_model: current.tts_model || "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit",
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

function idForPayload(kindKey, payload) {
  return idFor(kindKey, payload);
}
