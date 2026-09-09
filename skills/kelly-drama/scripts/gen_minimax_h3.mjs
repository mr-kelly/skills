#!/usr/bin/env node
// Local MiniMax-H3 MLX wrapper for Kelly Drama shot generation.
// The runtime produces synchronized video/audio on Apple Silicon. It supports
// first-frame conditioning when an approved storyboard image exists and an
// explicit text-to-video-and-audio fallback when image generation is unavailable.
// It never calls a cloud video provider.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const H3_DIR = process.env.KELLY_DRAMA_H3_DIR || "";
const DEFAULT_TURBO = "weights/adapters/minimax-h3-turbo/minimax_h3_turbo_v4_step600_ema.safetensors";
const DEFAULT_FPS = 24;

function framesForDuration(seconds, fps = DEFAULT_FPS) {
  const target = Math.max(22, Math.round(((Number(seconds) || 8) * fps - 5) / 17) * 17 + 5);
  return target;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env } });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit ${code}`))));
  });
}

export async function generateMiniMaxH3Video({
  image = "",
  referenceImages = [],
  prompt = "",
  output = "",
  durationSeconds = 8,
  width = 288,
  height = 512,
  fps = DEFAULT_FPS,
  frames = framesForDuration(durationSeconds, fps),
  steps = Number(process.env.KELLY_DRAMA_H3_STEPS || 4),
  turboLora = process.env.KELLY_DRAMA_H3_TURBO_LORA || DEFAULT_TURBO,
} = {}) {
  if (!H3_DIR) throw new Error("KELLY_DRAMA_H3_DIR is required for MiniMax-H3 MLX generation.");
  if (!output) throw new Error("generateMiniMaxH3Video requires an output path.");
  if (!prompt) throw new Error("generateMiniMaxH3Video requires a prompt.");
  if (!fs.existsSync(H3_DIR)) throw new Error(`MiniMax-H3 MLX checkout not found: ${H3_DIR}`);
  if (image && referenceImages.length)
    throw new Error("MiniMax-H3 first-frame and reference-image modes are mutually exclusive.");
  if (referenceImages.length > 9) throw new Error("MiniMax-H3 supports at most 9 reference images.");
  for (const reference of referenceImages) {
    if (!fs.existsSync(reference)) throw new Error(`MiniMax-H3 reference image not found: ${reference}`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const args = [
    "run",
    "mlx-h3",
    prompt,
    "--width",
    String(width),
    "--height",
    String(height),
    "--frames",
    String(frames),
    "--steps",
    String(steps),
    "--turbo-lora",
    turboLora,
    "--output",
    output,
  ];
  if (image) args.splice(3, 0, "--first-frame", image);
  for (const reference of referenceImages.toReversed()) args.splice(3, 0, "--ref-image", reference);
  await run("uv", args, H3_DIR);
  if (!fs.existsSync(output) || fs.statSync(output).size === 0)
    throw new Error(`MiniMax-H3 produced no video: ${output}`);
  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = JSON.parse(process.argv[2] || "{}");
  generateMiniMaxH3Video(args)
    .then((output) => process.stdout.write(`${output}\n`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
