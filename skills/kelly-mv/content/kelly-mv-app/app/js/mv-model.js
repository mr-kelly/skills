// Pure domain logic for Kelly MV, ported verbatim (types stripped) from the
// retired app/server/state.ts + app/server/demo.ts + lib/generation/image-service.ts.
// Same variable names, same order of operations — only the on-disk/task-queue
// concepts (tasks[], library/projects switcher) are dropped because the
// Busabase-only shape has no local task queue and models exactly one MV
// project per workspace (see js/config.js's header comment for why the old
// multi-project "library" was not ported).
//
// Every destructured function parameter below has a default value even where
// the retired TS interfaces marked the field required — this avoids a known
// checkJs false-positive ("property does not exist") at call sites.

export function countBy(items = [], field = "status") {
  const counts = {};
  for (const item of items || []) {
    const key = item?.[field] || "draft";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function completeness(project = {}) {
  const song = project.song || {};
  const concept = project.treatment || {};
  const shots = project.shots || [];
  const songReady = Boolean(song.audio_asset);
  const conceptReady = Boolean(concept.summary || concept.concept);
  const charactersMissingRefs = (project.characters || []).filter(
    (character) => !character.reference_card?.image_asset,
  ).length;
  const shotsMissingDesc = shots.filter((shot) => !String(shot.description || "").trim()).length;
  const shotsMissingImage = shots.filter((shot) => !shot.image_asset).length;
  const shotsMissingVideo = shots.filter((shot) => !shot.video_asset).length;
  const shotsTotalSeconds = shots.reduce((sum, shot) => sum + num(shot.duration_seconds), 0);
  return {
    song_ready: songReady,
    concept_ready: conceptReady,
    characters_missing_refs: charactersMissingRefs,
    shots_missing_desc: shotsMissingDesc,
    shots_missing_image: shotsMissingImage,
    shots_missing_video: shotsMissingVideo,
    shots_total_seconds: Math.round(shotsTotalSeconds),
    song_duration: num(song.duration_seconds),
  };
}

export function attention(project = {}) {
  const characters = project.characters || [];
  const shots = project.shots || [];
  const needsReview =
    characters.filter((item) => item.status === "needs_review").length +
    shots.filter((item) => item.status === "needs_review").length;
  const approved =
    characters.filter((item) => item.status === "approved").length +
    shots.filter((item) => item.status === "approved").length;
  const blocked = shots.filter((item) => item.status === "blocked").length;
  return { needs_review: needsReview, approved, blocked };
}

// The single most useful next step for the human.
export function nextStep(project = {}) {
  const c = completeness(project);
  if (!c.song_ready) return "upload_song";
  if (!c.concept_ready) return "set_concept";
  if ((project.characters || []).length === 0) return "add_cast";
  if (c.characters_missing_refs > 0) return "generate_cast_refs";
  if ((project.shots || []).length === 0) return "add_shots";
  if (c.shots_missing_image > 0) return "fill_shot_images";
  if (c.shots_missing_video > 0) return "fill_shot_videos";
  return "review";
}

export function statePayloadFor(project = {}) {
  return {
    app: "kelly-mv",
    project,
    projects: [
      {
        id: project.project_id,
        title: project.song?.title || "未命名 MV",
        artist: project.song?.artist || "",
        mode: project.treatment?.mode || "",
      },
    ],
    active_project_id: project.project_id,
    counts: {
      characters: countBy(project.characters),
      shots: countBy(project.shots),
      tasks: {},
    },
    totals: {
      characters: (project.characters || []).length,
      shots: (project.shots || []).length,
      tasks: 0,
    },
    completeness: completeness(project),
    attention: attention(project),
    next_step: nextStep(project),
  };
}

// ---- storyboard prompt (ported from lib/generation/image-service.ts) ----

export function shotCharacters(project = {}, shot = {}) {
  return (shot.characters || []).map((id) => (project.characters || []).find((item) => item.id === id)).filter(Boolean);
}

export function hasGeneratedRef(character = {}) {
  return Boolean(character?.reference_card?.image_asset);
}

export function storyboardPrompt(project = {}, shot = {}) {
  const concept = project.treatment || {};
  const song = project.song || {};
  const characters = shotCharacters(project, shot);
  const characterNames = characters.map((c) => `${c.name}: ${c.visual?.front || c.role || ""}`.trim()).filter(Boolean);
  const withRefs = characters.filter(hasGeneratedRef);
  const scene =
    shot.description ||
    [shot.composition, shot.action, shot.setting, shot.lighting].filter(Boolean).join(". ") ||
    shot.prompt ||
    "";
  const look = concept.look || concept.realism_target || concept.color_palette || "";
  return [
    `Music video storyboard frame for the song "${song.title || "untitled"}"${song.artist ? ` by ${song.artist}` : ""}.`,
    concept.summary || concept.concept ? `MV concept: ${concept.summary || concept.concept}` : "",
    look ? `Visual style: ${look}` : "",
    concept.aspect_ratio ? `Aspect ratio: ${concept.aspect_ratio}.` : "",
    `Shot: ${shot.title || shot.id}.`,
    scene ? `Scene: ${scene}` : "",
    characterNames.length ? `Characters: ${characterNames.join("; ")}` : "",
    withRefs.length
      ? `Character consistency: reference portrait images are provided for ${withRefs.map((c) => c.name).join("、")}. Keep each performer's face, hairstyle, body type and wardrobe identical to their reference image; do not redesign or swap them.`
      : "",
    `Style: cinematic music-video still, ${look || "photoreal"}, production-ready frame. No on-screen lyrics, captions, watermarks or UI.`,
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
  return refs.slice(0, MAX_SHOT_REFERENCES);
}

export function storyboardPromptPreview(project = {}, shotId = "") {
  const shot = (project.shots || []).find((item) => item.id === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);
  const references = collectShotReferences(project, shot);
  const treatment = project.treatment || {};
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
      song_title: project.song?.title || "",
      artist: project.song?.artist || "",
      concept: treatment.concept || "",
      realism_target: treatment.realism_target || "",
      color_palette: treatment.color_palette || "",
    },
  };
}

// ---- misc small helpers shared by app.js / workspace-views.js ----

export function listToArray(value) {
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
