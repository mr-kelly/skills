import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, GENERATED_DIR, SKILL_DIR } from "./paths.mjs";
import { loadProject, saveProject } from "./project-store.mjs";
import { pathExists, readJson, slug } from "./utils.mjs";

const VOICE_DIR = path.join(GENERATED_DIR, "voices");
const TTS_CONFIG_PATH = path.join(DATA_DIR, "tts_config.json");

const DEFAULT_TTS_CONFIG = {
  backend: "qwen3-tts-mlx",
  python: ".data/tts/venv/bin/python", // relative to app dir
  wrapper: "scripts/gen_voice.py", // relative to skill dir
  model: "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit",
};

async function loadTtsConfig() {
  const disk = (await pathExists(TTS_CONFIG_PATH)) ? await readJson(TTS_CONFIG_PATH, {}) : {};
  return { ...DEFAULT_TTS_CONFIG, ...disk };
}

// Build a Qwen3-TTS VoiceDesign "instruct" string from the character's voice_profile.
function voiceInstruct(character) {
  const vp = character.voice_profile || {};
  const parts = [vp.type, vp.pace, vp.accent, vp.signature, vp.casting_reference].filter(Boolean);
  const base = parts.join("，");
  return `${character.name}（${character.role || ""}）的嗓音：${base}。东汉历史剧配音，自然真人质感，避免机械感。`;
}

function voiceScript(character) {
  return character.voice_profile?.sample_script || character.character_card?.voice || `我是${character.name}。`;
}

export async function generateCharacterVoice(characterId) {
  const cfg = await loadTtsConfig();
  const project = await loadProject();
  const ch = (project.characters || []).find((c) => c.id === characterId);
  if (!ch) throw new Error(`Unknown character: ${characterId}`);

  const pyAbs = path.resolve(DATA_DIR, "..", cfg.python);
  if (!(await pathExists(pyAbs))) {
    throw new Error("本地 TTS 还没装好（mlx-audio venv 未就绪），请稍候再试。");
  }
  const wrapperAbs = path.join(SKILL_DIR, cfg.wrapper);

  await fs.mkdir(VOICE_DIR, { recursive: true });
  const filename = `${slug(ch.id)}-${Date.now()}.wav`;
  const outAbs = path.join(VOICE_DIR, filename);
  const args = {
    model: cfg.model,
    text: voiceScript(ch),
    instruct: voiceInstruct(ch),
    output: outAbs,
  };

  const outPath = await runWrapper(pyAbs, wrapperAbs, args);
  if (!(await pathExists(outPath))) throw new Error("语音生成未产出文件，见日志。");

  const publicPath = `/generated/voices/${path.basename(outPath)}`;
  const generatedAt = new Date().toISOString();
  const generation = { backend: cfg.backend, model: cfg.model, instruct: args.instruct, script: args.text };

  project.characters = (project.characters || []).map((c) => {
    if (c.id !== ch.id) return c;
    const prior = c.voice_candidates?.length
      ? c.voice_candidates
      : c.voice_reference?.asset?.startsWith("/generated/")
        ? [
            {
              path: c.voice_reference.asset,
              generated_at: c.voice_reference.generated_at || generatedAt,
              generation: c.voice_reference.generation || {},
            },
          ]
        : [];
    const voice_candidates = [...prior, { path: publicPath, generated_at: generatedAt, generation }];
    return {
      ...c,
      voice_candidates,
      voice_reference: {
        ...(c.voice_reference || {}),
        status: "generated",
        provider: cfg.backend,
        asset: publicPath,
        generated_at: generatedAt,
        generation,
      },
    };
  });
  await saveProject(project);
  return { path: publicPath, state: await import("./state.mjs").then((m) => m.statePayload()) };
}

export async function setCharacterVoiceActive(characterId, assetPath) {
  const project = await loadProject();
  const ch = (project.characters || []).find((c) => c.id === characterId);
  if (!ch) throw new Error(`Unknown character: ${characterId}`);
  const match = (ch.voice_candidates || []).find((c) => c.path === assetPath);
  if (!match) throw new Error("该候选不存在，无法设为选用。");
  ch.voice_reference = {
    ...(ch.voice_reference || {}),
    status: "generated",
    asset: match.path,
    generated_at: match.generated_at,
    generation: match.generation,
  };
  await saveProject(project);
  return import("./state.mjs").then((m) => m.statePayload());
}

function runWrapper(pyAbs, wrapperAbs, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(pyAbs, [wrapperAbs, JSON.stringify(args)], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`语音生成失败 (exit ${code}): ${(err || out).slice(-600)}`));
      const lastLine = out.trim().split("\n").filter(Boolean).pop() || "";
      resolve(lastLine.trim());
    });
  });
}
