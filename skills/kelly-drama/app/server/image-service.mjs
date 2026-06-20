import fs from "node:fs/promises";
import path from "node:path";
import { IMAGE_CONFIG_PATH, REFERENCE_IMAGE_DIR, STORYBOARD_IMAGE_DIR } from "./paths.mjs";
import { loadProject, saveProject } from "./project-store.mjs";
import { pathExists, readJson, slug, writeJson } from "./utils.mjs";

const DEFAULT_CONFIG = {
  base_url: "https://moonrouter.dev/v1",
  api_key: "",
  model: "gpt-image-2",
  size: "1024x1024",
};

function cleanBaseUrl(value) {
  return String(value || DEFAULT_CONFIG.base_url).replace(/\/+$/, "");
}

function masked(key) {
  if (!key) return "";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function publicConfig(config) {
  return {
    base_url: config.base_url,
    model: config.model,
    size: config.size,
    has_api_key: Boolean(config.api_key),
    api_key_preview: masked(config.api_key),
  };
}

export async function loadImageConfig() {
  const disk = (await pathExists(IMAGE_CONFIG_PATH)) ? await readJson(IMAGE_CONFIG_PATH, {}) : {};
  return {
    ...DEFAULT_CONFIG,
    ...disk,
    base_url: cleanBaseUrl(disk.base_url),
  };
}

export async function imageConfigPayload() {
  return publicConfig(await loadImageConfig());
}

export async function saveImageConfig(input = {}) {
  const current = await loadImageConfig();
  const next = {
    base_url: cleanBaseUrl(input.base_url || current.base_url),
    api_key: input.api_key === "__KEEP__" ? current.api_key : String(input.api_key || ""),
    model: String(input.model || current.model || DEFAULT_CONFIG.model),
    size: String(input.size || current.size || DEFAULT_CONFIG.size),
  };
  await writeJson(IMAGE_CONFIG_PATH, next);
  return publicConfig(next);
}

function storyboardPrompt(project, shot) {
  const bible = project.series?.visual_bible || {};
  const characterNames = (shot.characters || []).map((id) => {
    const character = (project.characters || []).find((item) => item.id === id);
    const ref = character?.reference_card?.image_asset ? ` reference image already exists: ${character.reference_card.image_asset}` : "";
    return character ? `${character.name}: ${character.visual?.front || character.role || ""}${ref}` : id;
  }).filter(Boolean);
  return [
    `Storyboard frame for a historical Chinese short drama adaptation of ${project.series?.title || "三国演义"}.`,
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
    `Style: cinematic storyboard still, grounded historical realism, clear character blocking, production-ready frame.`,
    shot.negative_prompt ? `Avoid: ${shot.negative_prompt}` : "",
  ].filter(Boolean).join("\n");
}

function visualBackgroundPrompt(project) {
  const bible = project.series?.visual_bible || {};
  return bible.background_prompt || [
    `Visual background reference for ${project.series?.title || "short drama"}.`,
    bible.aspect_ratio ? `Aspect ratio: ${bible.aspect_ratio} ${bible.orientation || ""}.` : "",
    bible.realism_target || "",
    bible.period_detail || "",
    bible.cinematography || "",
  ].filter(Boolean).join("\n");
}

function characterCardPrompt(character, project) {
  return [
    character.reference_card?.prompt || "",
    project.series?.visual_bible?.realism_target ? `Series visual target: ${project.series.visual_bible.realism_target}` : "",
    project.series?.visual_bible?.aspect_ratio ? `Aspect ratio: ${project.series.visual_bible.aspect_ratio} ${project.series.visual_bible.orientation || ""}.` : "",
  ].filter(Boolean).join("\n");
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

  const endpoint = `${cleanBaseUrl(config.base_url)}/images/generations`;
  const payload = {
    model: config.model || DEFAULT_CONFIG.model,
    prompt: storyboardPrompt(project, shot),
    size: config.size || DEFAULT_CONFIG.size,
    response_format: "b64_json",
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Image API failed: ${response.status}`;
    throw new Error(message);
  }

  const bytes = imageBytesFromResponse(data);
  await fs.mkdir(STORYBOARD_IMAGE_DIR, { recursive: true });
  const filename = `${slug(shot.id)}-${Date.now()}.png`;
  const diskPath = path.join(STORYBOARD_IMAGE_DIR, filename);
  await fs.writeFile(diskPath, bytes);
  const publicPath = `/generated/storyboards/${filename}`;

  project.shots = (project.shots || []).map((item) => item.id === shot.id ? {
    ...item,
    image_asset: publicPath,
    image_generated_at: new Date().toISOString(),
    image_generation: {
      provider: "openai-compatible",
      base_url: config.base_url,
      model: payload.model,
      size: payload.size,
    },
  } : item);
  await saveProject(project);
  return { path: publicPath, state: await import("./state.mjs").then((mod) => mod.statePayload()) };
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
      "Authorization": `Bearer ${config.api_key}`,
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
  await fs.mkdir(REFERENCE_IMAGE_DIR, { recursive: true });
  const filename = `visual-background-${Date.now()}.png`;
  const diskPath = path.join(REFERENCE_IMAGE_DIR, filename);
  await fs.writeFile(diskPath, bytes);
  const publicPath = `/generated/references/${filename}`;
  project.series = {
    ...project.series,
    visual_bible: {
      ...(project.series?.visual_bible || {}),
      background_reference_assets: [
        ...((project.series?.visual_bible?.background_reference_assets || []).filter((item) => item.path !== publicPath)),
        {
          id: `bg-ref-${Date.now()}`,
          title: "汉末乱世背景参考",
          path: publicPath,
          generated_at: new Date().toISOString(),
          model: payload.model,
          size: payload.size,
        },
      ],
    },
  };
  await saveProject(project);
  return { path: publicPath, state: await import("./state.mjs").then((mod) => mod.statePayload()) };
}

export async function generateCharacterCard(characterId) {
  const config = await loadImageConfig();
  if (!config.api_key) throw new Error("Image API Key is not configured.");
  const project = await loadProject();
  const character = (project.characters || []).find((item) => item.id === characterId);
  if (!character) throw new Error(`Unknown character: ${characterId}`);
  const { bytes, payload } = await callImageApi(characterCardPrompt(character, project), config);
  await fs.mkdir(REFERENCE_IMAGE_DIR, { recursive: true });
  const filename = `${slug(character.id)}-reference-card-${Date.now()}.png`;
  const diskPath = path.join(REFERENCE_IMAGE_DIR, filename);
  await fs.writeFile(diskPath, bytes);
  const publicPath = `/generated/references/${filename}`;
  project.characters = (project.characters || []).map((item) => item.id === character.id ? {
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
  } : item);
  await saveProject(project);
  return { path: publicPath, state: await import("./state.mjs").then((mod) => mod.statePayload()) };
}
