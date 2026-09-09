import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ASSET_LIMIT_BYTES = 25 * 1024 * 1024;
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIR = process.env.KELLY_DRAMA_SKILL_DIR || path.resolve(APP_DIR, "../..");

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000 });
  return !result.error && result.status === 0;
}

function directoryAvailable(value) {
  if (!value) return false;
  try {
    return fs.statSync(path.resolve(value)).isDirectory();
  } catch {
    return false;
  }
}

function capability(available, availableLabel, missingLabel) {
  return { available, reason: available ? availableLabel : missingLabel };
}

export function inspectCapabilities(env = process.env) {
  const platform = process.platform;
  const arch = process.arch;
  const ffmpeg = commandAvailable("ffmpeg", ["-version"]);
  const ffprobe = commandAvailable("ffprobe", ["-version"]);
  const hyperframes =
    commandAvailable("hyperframes") || commandAvailable("npx", ["--offline", "--yes", "hyperframes", "--version"]);
  const python = env.KELLY_DRAMA_TTS_PYTHON || "python3";
  const mlxPython = platform === "darwin" && arch === "arm64" && commandAvailable(python, ["-c", "import mlx_audio"]);
  const apiTts = Boolean(env.KELLY_DRAMA_TTS_API_KEY && env.KELLY_DRAMA_TTS_BASE_URL);
  const h3Dir = env.KELLY_DRAMA_H3_DIR || "";
  const h3 =
    platform === "darwin" && arch === "arm64" && directoryAvailable(h3Dir) && commandAvailable("uv", ["--version"]);
  const ltxDir = env.KELLY_DRAMA_LTX_DIR || path.join(SKILL_DIR, "app", ".data", "ltx-video");
  const ltx = directoryAvailable(ltxDir) && fs.existsSync(path.join(ltxDir, "venv", "bin", "python"));

  return {
    checked_at: new Date().toISOString(),
    runtime: { platform, arch, cpus: os.cpus().length, memory_bytes: os.totalmem() },
    limits: { busabase_asset_bytes: ASSET_LIMIT_BYTES },
    tools: {
      ffmpeg: capability(ffmpeg, "FFmpeg is available.", "Install FFmpeg to assemble and compress episodes."),
      ffprobe: capability(ffprobe, "FFprobe is available.", "Install FFprobe to validate generated media."),
      hyperframes: capability(
        hyperframes,
        "HyperFrames CLI is available.",
        "Install HyperFrames before final composition and rendering.",
      ),
    },
    providers: {
      image: capability(
        Boolean(env.KELLY_DRAMA_IMAGE_API_KEY),
        "Image API credentials are configured.",
        "Set KELLY_DRAMA_IMAGE_API_KEY in the trusted runtime.",
      ),
      seedance: capability(
        Boolean(env.KELLY_DRAMA_ARK_API_KEY),
        "Seedance/Ark credentials are configured.",
        "Set KELLY_DRAMA_ARK_API_KEY in the trusted runtime.",
      ),
      minimax_h3: capability(
        h3,
        "MiniMax H3 MLX is available.",
        platform !== "darwin" || arch !== "arm64"
          ? "MiniMax H3 MLX requires Apple Silicon."
          : "Set KELLY_DRAMA_H3_DIR to a valid checkout and install uv.",
      ),
      ltx: capability(ltx, "Local LTX-Video is available.", "Set KELLY_DRAMA_LTX_DIR to a valid checkout."),
      qwen_tts: capability(
        mlxPython,
        "Qwen3-TTS MLX is available.",
        platform !== "darwin" || arch !== "arm64"
          ? "Qwen3-TTS MLX requires Apple Silicon; use an API or uploaded voice instead."
          : `Install mlx_audio for ${python}.`,
      ),
      api_tts: capability(
        apiTts,
        "OpenAI-compatible TTS credentials are configured.",
        "Set KELLY_DRAMA_TTS_BASE_URL and KELLY_DRAMA_TTS_API_KEY for cross-platform TTS.",
      ),
    },
    workflows: {
      episode_render: capability(
        ffmpeg && ffprobe,
        "Episode rough-cut rendering is available.",
        "Episode rendering requires FFmpeg and FFprobe.",
      ),
    },
  };
}
