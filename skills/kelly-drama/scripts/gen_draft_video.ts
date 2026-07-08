#!/usr/bin/env node
import { spawn } from "node:child_process";
// Draft video wrapper: image-to-video via the local official LTX-Video repo (MPS).
// Invoked by server/video-service.ts with a JSON arg; prints the final .mp4 path
// as the LAST stdout line. All LTX logs go to stderr.
//
// args JSON: { image, prompt, width, height, fps, frames, output, seed? }
import fs from "node:fs";
import path from "node:path";

const args = JSON.parse(process.argv[2]);
const SKILL_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LTX_DIR = path.join(SKILL_DIR, "app", ".data", "ltx-video");
const PY = path.join(LTX_DIR, "venv", "bin", "python");
const INFER = path.join(LTX_DIR, "inference.py");
const CONFIG = process.env.LTX_CONFIG
  ? path.join(LTX_DIR, "configs", process.env.LTX_CONFIG)
  : path.join(LTX_DIR, "configs", "ltxv-2b-0.9.8-distilled.yaml");

const outDir = path.dirname(args.output);
fs.mkdirSync(outDir, { recursive: true });
const before = new Set(fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith(".mp4")) : []);

const cli = [
  INFER,
  "--prompt",
  args.prompt || "",
  "--conditioning_media_paths",
  args.image,
  "--conditioning_start_frames",
  "0",
  "--height",
  String(args.height),
  "--width",
  String(args.width),
  "--num_frames",
  String(args.frames),
  "--frame_rate",
  String(args.fps),
  "--pipeline_config",
  CONFIG,
  "--output_path",
  outDir,
  "--seed",
  String(args.seed ?? 171198),
];

const child = spawn(PY, cli, { cwd: LTX_DIR, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env } });
child.on("error", (e) => {
  console.error("spawn error:", e.message);
  process.exit(1);
});
child.on("close", (code) => {
  if (code !== 0) {
    console.error("inference.py exit", code);
    process.exit(code || 1);
  }
  const after = fs.readdirSync(outDir).filter((f) => f.endsWith(".mp4") && !before.has(f));
  if (!after.length) {
    console.error("no new mp4 produced in", outDir);
    process.exit(2);
  }
  // newest new mp4
  const produced = after
    .map((f) => ({ f, t: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f;
  const producedAbs = path.join(outDir, produced);
  if (producedAbs !== args.output) fs.renameSync(producedAbs, args.output);
  process.stdout.write(`${args.output}\n`);
});
