import path from "node:path";
import { loadProject, saveProject } from "../../app/server/project-store.ts";
import { provider } from "../../app/server/provider.ts";
import type { ImageConfig } from "../../app/server/types.ts";
import { slug } from "../../app/server/utils.ts";

const DEFAULT_CONFIG: ImageConfig = {
  base_url: "https://moonrouter.dev/v1",
  api_key: "",
  model: "gpt-image-2",
  size: "1024x1024",
};

function cleanBaseUrl(value) {
  return String(value || DEFAULT_CONFIG.base_url).replace(/\/+$/, "");
}

function publicConfig(config) {
  return {
    base_url: config.base_url,
    model: config.model,
    size: config.size,
    has_api_key: Boolean(config.api_key),
  };
}

export async function loadImageConfig() {
  const disk = await provider.readImageConfig();
  return {
    ...DEFAULT_CONFIG,
    ...disk,
    api_key: process.env.KELLY_MV_IMAGE_API_KEY || "",
    base_url: cleanBaseUrl(disk.base_url),
  };
}

export async function imageConfigPayload() {
  return publicConfig(await loadImageConfig());
}

export async function saveImageConfig(input: ImageConfig = {}) {
  const current = await loadImageConfig();
  const next = {
    base_url: cleanBaseUrl(input.base_url || current.base_url),
    model: String(input.model || current.model || DEFAULT_CONFIG.model),
    size: String(input.size || current.size || DEFAULT_CONFIG.size),
  };
  await provider.writeImageConfig(next);
  return publicConfig({ ...next, api_key: process.env.KELLY_MV_IMAGE_API_KEY || "" });
}

function shotCharacters(project, shot) {
  return (shot.characters || []).map((id) => (project.characters || []).find((item) => item.id === id)).filter(Boolean);
}

function hasGeneratedRef(character) {
  return Boolean(character?.reference_card?.image_asset?.startsWith("/generated/"));
}

export function storyboardPrompt(project, shot) {
  const concept = project.treatment || {};
  const song = project.song || {};
  const characters = shotCharacters(project, shot);
  const characterNames = characters.map((c) => `${c.name}: ${c.visual?.front || c.role || ""}`.trim()).filter(Boolean);
  const withRefs = characters.filter(hasGeneratedRef);
  // The shot's free-text scene description is the main brief. Old rich-sheet data falls
  // back to its composed fields so existing projects still generate.
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

function collectShotReferences(project, shot) {
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
  const backgrounds = project.treatment?.background_reference_assets || [];
  const bg = backgrounds[backgrounds.length - 1];
  if (refs.length < MAX_SHOT_REFERENCES && bg?.path?.startsWith("/generated/")) {
    refs.push({ kind: "background", id: bg.id || "background", name: bg.title || "风格参考", path: bg.path });
  }
  return refs.slice(0, MAX_SHOT_REFERENCES);
}

async function callImageEdits(prompt, references, config) {
  const endpoint = `${cleanBaseUrl(config.base_url)}/images/edits`;
  const form = new FormData();
  form.append("model", config.model || DEFAULT_CONFIG.model);
  form.append("prompt", prompt);
  form.append("size", config.size || DEFAULT_CONFIG.size);
  form.append("n", "1");
  for (const ref of references) {
    const buf = await provider.readGeneratedBytes(ref.path);
    if (!buf) throw new Error(`Reference image not found: ${ref.path}`);
    form.append("image[]", new Blob([Buffer.from(buf)], { type: "image/png" }), path.basename(ref.path));
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.api_key}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Image edits API failed: ${response.status}`;
    throw new Error(message);
  }
  return {
    bytes: imageBytesFromResponse(data),
    payload: {
      model: config.model || DEFAULT_CONFIG.model,
      size: config.size || DEFAULT_CONFIG.size,
      mode: "image-edit",
    },
  };
}

export async function storyboardPromptPreview(shotId) {
  const project = await loadProject();
  const shot = (project.shots || []).find((item) => item.id === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);
  const config = await loadImageConfig();
  const references = collectShotReferences(project, shot);
  const treatment = project.treatment || {};
  return {
    shot_id: shot.id,
    title: shot.title || shot.id,
    duration: shot.duration_preset || (shot.duration_seconds ? `${shot.duration_seconds}s` : ""),
    mode: references.length ? "image-edit" : "text-to-image",
    model: config.model,
    size: config.size,
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

function visualBackgroundPrompt(project) {
  const treatment = project.treatment || {};
  return (
    treatment.background_prompt ||
    [
      `Visual style reference frame for the music video of "${project.song?.title || "untitled"}".`,
      treatment.concept ? `Concept: ${treatment.concept}` : "",
      treatment.aspect_ratio ? `Aspect ratio: ${treatment.aspect_ratio} ${treatment.orientation || ""}.` : "",
      treatment.realism_target || "",
      treatment.color_palette ? `Color palette: ${treatment.color_palette}` : "",
      treatment.cinematography || "",
      "No on-screen text, captions, watermarks or UI.",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

function characterCardPrompt(character, project) {
  const treatment = project.treatment || {};
  return [
    character.reference_card?.prompt || "",
    treatment.realism_target ? `MV visual target: ${treatment.realism_target}` : "",
    treatment.aspect_ratio ? `Aspect ratio: ${treatment.aspect_ratio} ${treatment.orientation || ""}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function imageBytesFromResponse(data) {
  const first = data?.data?.[0];
  const b64 = first?.b64_json || first?.image_base64 || first?.base64;
  if (!b64) throw new Error("Image API response did not include base64 image data.");
  return Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ""), "base64");
}

export async function generateStoryboardImage(shotId) {
  const config = await loadImageConfig();
  if (!config.api_key) throw new Error("Image API Key is not configured.");
  const project = await loadProject();
  const shot = (project.shots || []).find((item) => item.id === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);

  const prompt = storyboardPrompt(project, shot);
  const references = collectShotReferences(project, shot);
  let bytes: Buffer;
  let payload: { model?: string; size?: string; mode?: string; [key: string]: unknown };
  if (references.length) {
    ({ bytes, payload } = await callImageEdits(prompt, references, config));
  } else {
    ({ bytes, payload } = await callImageApi(prompt, config));
    payload = { ...payload, mode: "text-to-image" };
  }

  const filename = `${slug(shot.id)}-${Date.now()}.png`;
  const { publicPath } = await provider.writeGenerated({ subdir: "storyboards", filename, bytes });

  const generation = {
    provider: "openai-compatible",
    base_url: config.base_url,
    model: payload.model,
    size: payload.size,
    mode: payload.mode || "text-to-image",
    reference_assets: references.map((ref) => ref.path),
  };
  const generatedAt = new Date().toISOString();

  project.shots = (project.shots || []).map((item) => {
    if (item.id !== shot.id) return item;
    // Append as a new candidate; keep prior generations. Newest becomes active.
    const prior = item.image_candidates?.length
      ? item.image_candidates
      : item.image_asset?.startsWith("/generated/")
        ? [
            {
              path: item.image_asset,
              generated_at: item.image_generated_at || generatedAt,
              generation: item.image_generation || {},
            },
          ]
        : [];
    const image_candidates = [...prior, { path: publicPath, generated_at: generatedAt, generation }];
    return {
      ...item,
      image_candidates,
      image_asset: publicPath, // active pointer
      image_generated_at: generatedAt,
      image_generation: generation,
    };
  });
  await saveProject(project);
  return { path: publicPath, state: await import("../../app/server/state.ts").then((mod) => mod.statePayload()) };
}

async function callImageApi(prompt, config) {
  const endpoint = `${cleanBaseUrl(config.base_url)}/images/generations`;
  const payload = {
    model: config.model || DEFAULT_CONFIG.model,
    prompt,
    size: config.size || DEFAULT_CONFIG.size,
    response_format: "b64_json",
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Image API failed: ${response.status}`;
    throw new Error(message);
  }
  return { bytes: imageBytesFromResponse(data), payload };
}

export async function generateVisualBackground() {
  const config = await loadImageConfig();
  if (!config.api_key) throw new Error("Image API Key is not configured.");
  const project = await loadProject();
  const { bytes, payload } = await callImageApi(visualBackgroundPrompt(project), config);
  const filename = `visual-background-${Date.now()}.png`;
  const { publicPath } = await provider.writeGenerated({ subdir: "references", filename, bytes });
  project.treatment = {
    ...(project.treatment || {}),
    background_reference_assets: [
      ...(project.treatment?.background_reference_assets || []).filter((item) => item.path !== publicPath),
      {
        id: `bg-ref-${Date.now()}`,
        title: "MV 风格参考",
        path: publicPath,
        generated_at: new Date().toISOString(),
        model: payload.model,
        size: payload.size,
      },
    ],
  };
  await saveProject(project);
  return { path: publicPath, state: await import("../../app/server/state.ts").then((mod) => mod.statePayload()) };
}

export async function generateCharacterCard(characterId) {
  const config = await loadImageConfig();
  if (!config.api_key) throw new Error("Image API Key is not configured.");
  const project = await loadProject();
  const character = (project.characters || []).find((item) => item.id === characterId);
  if (!character) throw new Error(`Unknown character: ${characterId}`);
  const { bytes, payload } = await callImageApi(characterCardPrompt(character, project), config);
  const filename = `${slug(character.id)}-reference-card-${Date.now()}.png`;
  const { publicPath } = await provider.writeGenerated({ subdir: "references", filename, bytes });
  project.characters = (project.characters || []).map((item) =>
    item.id === character.id
      ? {
          ...item,
          reference_card: {
            ...(item.reference_card || {}),
            status: "generated",
            image_asset: publicPath,
            generated_at: new Date().toISOString(),
            generation: {
              provider: "openai-compatible",
              base_url: config.base_url,
              model: payload.model,
              size: payload.size,
            },
          },
        }
      : item,
  );
  await saveProject(project);
  return { path: publicPath, state: await import("../../app/server/state.ts").then((mod) => mod.statePayload()) };
}
