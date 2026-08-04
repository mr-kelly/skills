// Pure domain logic for Kelly Drama, ported verbatim (types stripped) from
// the retired app/server/demo.ts (completeness/attention), app/js/shots.js
// (shot readiness — already pure, just relocated so both the browser and the
// trusted scripts.mjs import the same rules), and lib/generation/image-service.ts
// + lib/generation/voice-service.ts (prompt/instruct builders). Same variable
// names, same order of operations — only the local task-queue/library-switcher
// concepts are dropped, same as every other converted skill (see
// js/config.js's header comment for why the old multi-project "library" was
// not ported).
//
// Every destructured function parameter below has a default value even where
// the retired code's callers always passed a value, to avoid a known checkJs
// false-positive ("property does not exist") at call sites.

export function countBy(items = [], field = "status") {
  const counts = {};
  for (const item of items || []) {
    const key = item?.[field] || "draft";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// ---- completeness / attention (ported from app/server/demo.ts) ----

export function completeness(project = {}) {
  const characters = project.characters || [];
  const relationships = project.relationships || [];
  const episodes = project.episodes || [];
  const shots = project.shots || [];
  return {
    characters_missing_views: characters.filter((c) => {
      const v = c.visual || {};
      return !v.front || !v.side || !v.back;
    }).length,
    relationships_missing_evidence: relationships.filter((r) => !(r.evidence || []).length).length,
    episodes_missing_cliffhanger: episodes.filter((e) => !e.cliffhanger).length,
    shots_missing_prompt: shots.filter((s) => !s.prompt || !s.negative_prompt).length,
  };
}

export function attention(project = {}) {
  const all = [
    ...(project.tasks || []),
    ...(project.characters || []),
    ...(project.episodes || []),
    ...(project.shots || []),
  ];
  return {
    needs_review: all.filter((item) => ["needs_review", "changes_requested"].includes(item.status)).length,
    approved: all.filter((item) => item.status === "approved").length,
    blocked: (project.tasks || []).filter((task) => task.status === "blocked").length,
  };
}

export function statePayloadFor(project = {}) {
  return {
    app: "kelly-drama",
    project,
    projects: [
      {
        id: project.project_id,
        title: project.series?.title,
        genre: project.series?.genre,
        format: project.series?.format,
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

// ---- shot readiness (ported from the retired app/js/shots.js — same rules
// as scripts/validate_shot_readiness.ts) ----

export function shotsForEpisode(project = {}, episodeId = "") {
  return (project.shots || []).filter((shot) => shot.episode_id === episodeId);
}

/** @type {[string, string, (s: any) => unknown][]} */
const SHOT_READINESS_FIELDS = [
  ["composition", "Composition", (s) => s.composition],
  ["camera", "Camera spec", (s) => s.shot_size || s.camera_movement || s.camera],
  ["setting", "Setting", (s) => s.setting],
  ["lighting", "Lighting", (s) => s.lighting],
  ["action", "Action script", (s) => s.action],
  ["prompt", "Image prompt", (s) => s.prompt],
  ["video_prompt", "Video prompt", (s) => s.video_prompt],
  [
    "audio",
    "Sound design",
    (s) =>
      s.audio &&
      (s.audio.ambient ||
        (s.audio.dialogue || []).length ||
        s.audio.narration ||
        (s.audio.sfx || []).length ||
        s.audio.music),
  ],
  ["transition", "Transition", (s) => s.transition_in && s.transition_out],
  ["continuity", "Continuity anchors", (s) => s.continuity && (s.continuity.anchors || []).length],
];

export function shotIsSilent(shot = {}) {
  if (shot.silent === true) return true;
  const a = shot.audio || {};
  return !(a.dialogue || []).length && !a.narration;
}

export function hasSoundBed(shot = {}) {
  const a = shot.audio || {};
  return Boolean(a.ambient || (a.sfx || []).length || a.music);
}

export function dialogueCps(shot = {}) {
  const seconds = Number(shot.duration_seconds) || 0;
  if (!seconds) return 0;
  const chars = (shot.srt || [])
    .map((l) => (typeof l === "string" ? l : l.text || ""))
    .join("")
    .replace(/\s/g, "").length;
  return chars / seconds;
}

export function shotReadiness(shot = {}) {
  const missing = SHOT_READINESS_FIELDS.filter(([, , get]) => !get(shot)).map(([, label]) => label);
  const durOk = [4, 5, 6, 8, 10, 12].includes(Number(shot.duration_seconds));
  if (!durOk) missing.push("Duration");
  const silent = shotIsSilent(shot);
  const cps = dialogueCps(shot);
  let pacingWarn = false;
  if (silent) {
    if (!hasSoundBed(shot)) missing.push("Sound bed");
  } else {
    if (!(shot.srt || []).length) missing.push("Dialogue SRT");
    pacingWarn = cps > 8;
  }
  return { missing, cps, pacingWarn, silent, ready: missing.length === 0 && !pacingWarn };
}

// ---- storyboard prompt (ported from lib/generation/image-service.ts) ----

export function shotCharacters(project = {}, shot = {}) {
  return (shot.characters || []).map((id) => (project.characters || []).find((item) => item.id === id)).filter(Boolean);
}

export function hasGeneratedRef(character = {}) {
  return Boolean(character?.reference_card?.image_asset);
}

export function storyboardPrompt(project = {}, shot = {}) {
  const bible = project.series?.visual_bible || {};
  const characters = shotCharacters(project, shot);
  const characterNames = characters.map((c) => `${c.name}: ${c.visual?.front || c.role || ""}`.trim()).filter(Boolean);
  const withRefs = characters.filter(hasGeneratedRef);
  return [
    `Storyboard frame for ${project.series?.title || "a short drama"}.`,
    bible.aspect_ratio ? `Aspect ratio: ${bible.aspect_ratio} ${bible.orientation || ""}.` : "",
    bible.realism_target ? `Visual target: ${bible.realism_target}` : "",
    bible.cinematography ? `Cinematography: ${bible.cinematography}` : "",
    bible.color_palette ? `Color palette: ${bible.color_palette}` : "",
    `Shot title: ${shot.title || shot.id}.`,
    `Composition: ${shot.composition || ""}`,
    `Camera: ${shot.camera || ""}`,
    `Setting: ${shot.setting || ""}`,
    `Lighting: ${shot.lighting || ""}`,
    characterNames.length ? `Characters: ${characterNames.join("; ")}` : "",
    withRefs.length
      ? `Character consistency: reference portrait images are provided for ${withRefs.map((c) => c.name).join("、")}. Keep each character's face, hairstyle, body type and costume identical to their reference image; do not redesign or swap them.`
      : "",
    shot.prompt ? `Shot brief: ${shot.prompt}` : "",
    `Style: ${bible.style_medium || "cinematic storyboard still, clear character blocking, production-ready frame"}.`,
    shot.negative_prompt ? `Avoid: ${shot.negative_prompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const MAX_SHOT_REFERENCES = 4;

export function collectShotReferences(project = {}, shot = {}) {
  const refs = [];
  for (const character of shotCharacters(project, shot)) {
    if (hasGeneratedRef(character)) {
      refs.push({
        kind: "character",
        id: character.id,
        name: character.name,
        path: character.reference_card.image_asset,
      });
    }
  }
  // Use the latest GENERAL background (scene-specific bgs carry a `scene` tag
  // and are human/library references only — don't bias every shot toward one scene).
  const backgrounds = project.series?.visual_bible?.background_reference_assets || [];
  const general = backgrounds.filter((b) => !b.scene);
  const pool = general.length ? general : backgrounds;
  const bg = pool[pool.length - 1];
  if (refs.length < MAX_SHOT_REFERENCES && bg?.path) {
    refs.push({ kind: "background", id: bg.id || "background", name: bg.title || "背景参考", path: bg.path });
  }
  return refs.slice(0, MAX_SHOT_REFERENCES);
}

export function storyboardPromptPreview(project = {}, shotId = "") {
  const shot = (project.shots || []).find((item) => item.id === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);
  const references = collectShotReferences(project, shot);
  const bible = project.series?.visual_bible || {};
  const episode = (project.episodes || []).find((item) => item.id === shot.episode_id);
  return {
    shot_id: shot.id,
    title: shot.title || shot.id,
    duration: shot.duration_preset || (shot.duration_seconds ? `${shot.duration_seconds}s` : ""),
    mode: references.length ? "image-edit" : "text-to-image",
    prompt: storyboardPrompt(project, shot),
    negative_prompt: shot.negative_prompt || "",
    references: references.map((ref) => ({ kind: ref.kind, name: ref.name, path: ref.path })),
    characters: shotCharacters(project, shot).map((c) => ({
      id: c.id,
      name: c.name,
      visual_front: c.visual?.front || "",
      reference_image: hasGeneratedRef(c) ? c.reference_card.image_asset : "",
    })),
    context: {
      series_title: project.series?.title || "",
      logline: project.series?.logline || "",
      episode_title: episode?.title || "",
      realism_target: bible.realism_target || "",
      color_palette: bible.color_palette || "",
      period_detail: bible.period_detail || "",
    },
  };
}

export function characterCardPrompt(character = {}, project = {}) {
  return [
    character.reference_card?.prompt || "",
    project.series?.visual_bible?.realism_target
      ? `Series visual target: ${project.series.visual_bible.realism_target}`
      : "",
    project.series?.visual_bible?.aspect_ratio
      ? `Aspect ratio: ${project.series.visual_bible.aspect_ratio} ${project.series.visual_bible.orientation || ""}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function visualBackgroundPrompt(project = {}) {
  const bible = project.series?.visual_bible || {};
  return (
    bible.background_prompt ||
    [
      `Visual background reference for ${project.series?.title || "short drama"}.`,
      bible.aspect_ratio ? `Aspect ratio: ${bible.aspect_ratio} ${bible.orientation || ""}.` : "",
      bible.realism_target || "",
      bible.period_detail || "",
      bible.cinematography || "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

// ---- voice instruct (ported from lib/generation/voice-service.ts) ----

export function voiceInstruct(character = {}) {
  const vp = character.voice_profile || {};
  const parts = [vp.type, vp.pace, vp.accent, vp.signature, vp.casting_reference].filter(Boolean);
  const base = parts.join("，");
  return `${character.name}（${character.role || ""}）的嗓音：${base}。短剧配音，自然真人质感，避免机械感。`;
}

export function voiceScript(character = {}) {
  return character.voice_profile?.sample_script || character.character_card?.voice || `我是${character.name}。`;
}

// ---- draft-video frame math (ported from lib/generation/video-service.ts) ----

export function framesForDuration(seconds = 4, cfg = {}) {
  const fps = cfg.fps || 24;
  const maxFrames = cfg.max_frames || 121;
  const target = Math.round(((Number(seconds) || 4) * fps) / 8) * 8 + 1; // (8k+1)
  return Math.max(25, Math.min(target, maxFrames));
}

export function draftPrompt(shot = {}) {
  return [shot.video_prompt, shot.action, shot.composition].filter(Boolean).join("\n") || shot.title || shot.id;
}

export function prodPrompt(shot = {}) {
  return [shot.video_prompt, shot.action].filter(Boolean).join(" ") || shot.composition || shot.title || shot.id;
}

// Candidates carry both the resolved display URL (`path`) and the stable
// `assetId` writes key off; the active pointer on the shot/character is the
// resolved URL, so match it back to a candidate's assetId for both the
// "active" highlight and the data attribute a click handler reads.
export function findActiveAssetId(candidates = [], activePath = "") {
  return (candidates || []).find((c) => c.path === activePath)?.assetId || "";
}

// ---- misc small helpers ----

export function listToArray(value = "") {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(/[\n,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function slug(value = "") {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item"
  );
}
