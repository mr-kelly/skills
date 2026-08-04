#!/usr/bin/env node
// Draft video generation: image-to-video via a local official LTX-Video
// checkout (MPS on Apple Silicon). Ported from the retired
// scripts/gen_draft_video.ts + lib/generation/video-service.ts's
// framesForDuration/draftPrompt, merged into one module since the Busabase
// -only shape has no server-side video-service.ts to own the frame-count math
// separately from the process spawn. Genuinely local generation (no cloud
// call, no API key) — still cannot run in the browser because it spawns a
// child process against a local model checkout and reads/writes local files.
//
// Exports `generateDraftVideo()` for scripts/execute_generation_requests.mjs;
// also runnable standalone for manual testing:
//   node scripts/gen_draft_video.mjs '{"image":"/abs/frame.png","prompt":"...","output":"/abs/out.mp4","durationSeconds":4}'
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LTX_DIR = path.join(SKILL_DIR, "app", ".data", "ltx-video");
const PY = path.join(LTX_DIR, "venv", "bin", "python");
const INFER = path.join(LTX_DIR, "inference.py");

const DEFAULT_WIDTH = 512; // 16:9, divisible by 32
const DEFAULT_HEIGHT = 288;
const DEFAULT_FPS = 24;
const DEFAULT_MAX_FRAMES = 121; // (8*15+1) ≈ 5s draft cap to keep local gen fast

function framesForDuration(seconds, fps, maxFrames) {
  const target = Math.round(((Number(seconds) || 4) * fps) / 8) * 8 + 1; // (8k+1)
  return Math.max(25, Math.min(target, maxFrames));
}

function runInference({ image, prompt, width, height, fps, frames, output, seed }) {
  return new Promise((resolve, reject) => {
    const config = process.env.LTX_CONFIG
      ? path.join(LTX_DIR, "configs", process.env.LTX_CONFIG)
      : path.join(LTX_DIR, "configs", "ltxv-2b-0.9.8-distilled.yaml");
    const outDir = path.dirname(output);
    fs.mkdirSync(outDir, { recursive: true });
    const before = new Set(fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith(".mp4")) : []);

    const cli = [
      INFER,
      "--prompt",
      prompt || "",
      "--conditioning_media_paths",
      image,
      "--conditioning_start_frames",
      "0",
      "--height",
      String(height),
      "--width",
      String(width),
      "--num_frames",
      String(frames),
      "--frame_rate",
      String(fps),
      "--pipeline_config",
      config,
      "--output_path",
      outDir,
      "--seed",
      String(seed ?? 171198),
    ];

    const child = spawn(PY, cli, { cwd: LTX_DIR, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env } });
    child.on("error", (error) => reject(new Error(`LTX-Video is not installed at ${LTX_DIR}: ${error.message}`)));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`inference.py exit ${code}`));
      const after = fs.readdirSync(outDir).filter((f) => f.endsWith(".mp4") && !before.has(f));
      if (!after.length) return reject(new Error(`no new mp4 produced in ${outDir}`));
      const produced = after
        .map((f) => ({ f, t: fs.statSync(path.join(outDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0].f;
      const producedAbs = path.join(outDir, produced);
      if (producedAbs !== output) fs.renameSync(producedAbs, output);
      resolve(output);
    });
  });
}

export async function generateDraftVideo({
  image = "",
  prompt = "",
  output = "",
  durationSeconds = 4,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  fps = DEFAULT_FPS,
  maxFrames = DEFAULT_MAX_FRAMES,
  seed = undefined,
} = {}) {
  if (!image) throw new Error("generateDraftVideo requires an image (the shot's storyboard keyframe).");
  if (!output) throw new Error("generateDraftVideo requires an output path.");
  if (!fs.existsSync(PY)) {
    throw new Error(
      `Local LTX-Video is not installed at ${LTX_DIR} — see references/mv-workflow.md for setup. Draft video generation is a genuinely local capability, not a stub, but needs the model checkout present.`,
    );
  }
  const frames = framesForDuration(durationSeconds, fps, maxFrames);
  await runInference({ image, prompt, width, height, fps, frames, output, seed });
  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = JSON.parse(process.argv[2] || "{}");
  generateDraftVideo(args)
    .then((outPath) => {
      process.stdout.write(`${outPath}\n`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
