import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { DATA_DIR, GENERATED_DIR } from "./paths.mjs";
import { loadProject, saveProject } from "./project-store.mjs";
import { pathExists, readJson, slug } from "./utils.mjs";

const VIDEO_DIR = path.join(GENERATED_DIR, "videos");
const VIDEO_CONFIG_PATH = path.join(DATA_DIR, "video_config.json");

// Draft: local LTX (Apple Silicon). Prod: Seedance 2.0 — see stub below.
const DEFAULT_VIDEO_CONFIG = {
  draft_backend: "ltx-video-mps", // official Lightricks/LTX-Video (0.9.x, MPS), local headless
  // wrapper receives JSON args on argv[2] and must print the output .mp4 path as the LAST stdout line
  draft_wrapper: "scripts/gen_draft_video.mjs",
  width: 512, // 16:9, divisible by 32 (512x288). Bump to 1024x576 for nicer drafts.
  height: 288,
  fps: 24,
  max_frames: 121, // (8*15+1) ≈ 5s draft cap to keep local gen fast
  // prod_backend: "seedance-2.0",  // PROD MODE — not implemented yet (see generateShotVideoProd)
};

async function loadVideoConfig() {
  const disk = (await pathExists(VIDEO_CONFIG_PATH)) ? await readJson(VIDEO_CONFIG_PATH, {}) : {};
  return { ...DEFAULT_VIDEO_CONFIG, ...disk };
}

function framesForDuration(seconds, cfg) {
  const target = Math.round(((Number(seconds) || 4) * cfg.fps) / 8) * 8 + 1; // (8k+1)
  return Math.max(25, Math.min(target, cfg.max_frames));
}

function absFromPublic(p) {
  return path.join(GENERATED_DIR, String(p).replace(/^\/generated\//, ""));
}

function draftPrompt(shot) {
  return [shot.video_prompt, shot.action, shot.composition].filter(Boolean).join("\n") || shot.title || shot.id;
}

// PROD MODE — Seedance 2.0 (or better). Intentionally not implemented yet.
// When wired: call the Seedance image-to-video API with shot.image_asset + shot.video_prompt
// at full duration/resolution, store under .data/generated/videos/, mode: "prod".
export async function generateShotVideoProd() {
  throw new Error("prod 模式（Seedance 2.0）暂未接入，仅保留占位。请用 draft 模式（本地 LTX）。");
}

export async function generateShotVideoDraft(shotId) {
  const cfg = await loadVideoConfig();
  const project = await loadProject();
  const shot = (project.shots || []).find((s) => s.id === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);
  if (!shot.image_asset?.startsWith("/generated/")) {
    throw new Error("该分镜还没有分镜图，请先生成分镜图（草稿视频基于关键帧做图生视频）。");
  }
  const imageAbs = absFromPublic(shot.image_asset);
  if (!(await pathExists(imageAbs))) throw new Error(`分镜图文件不存在: ${imageAbs}`);

  await fs.mkdir(VIDEO_DIR, { recursive: true });
  const frames = framesForDuration(shot.duration_seconds, cfg);
  const filename = `${slug(shot.id)}-draft-${Date.now()}.mp4`;
  const outAbs = path.join(VIDEO_DIR, filename);
  const args = {
    backend: cfg.draft_backend,
    image: imageAbs,
    prompt: draftPrompt(shot),
    width: cfg.width,
    height: cfg.height,
    fps: cfg.fps,
    frames,
    output: outAbs,
  };

  const wrapperAbs = path.resolve(path.join(DATA_DIR, "..", ".."), cfg.draft_wrapper);
  const outPath = await runWrapper(wrapperAbs, args);
  if (!(await pathExists(outPath))) throw new Error(`视频生成未产出文件，见日志。`);

  const publicPath = `/generated/videos/${path.basename(outPath)}`;
  const generatedAt = new Date().toISOString();
  const generation = {
    mode: "draft",
    backend: cfg.draft_backend,
    width: cfg.width,
    height: cfg.height,
    fps: cfg.fps,
    frames,
    source_image: shot.image_asset,
  };
  project.shots = (project.shots || []).map((s) => {
    if (s.id !== shot.id) return s;
    // Append as a new candidate; keep prior drafts. Newest becomes active.
    const prior = s.video_candidates && s.video_candidates.length
      ? s.video_candidates
      : (s.video_asset?.startsWith("/generated/")
        ? [{ path: s.video_asset, generated_at: s.video_generated_at || generatedAt, generation: s.video_generation || {} }]
        : []);
    const video_candidates = [...prior, { path: publicPath, generated_at: generatedAt, generation }];
    return { ...s, video_candidates, video_asset: publicPath, video_generated_at: generatedAt, video_generation: generation };
  });
  await saveProject(project);
  return { path: publicPath, state: await import("./state.mjs").then((m) => m.statePayload()) };
}

function runWrapper(wrapperAbs, args) {
  return new Promise((resolve, reject) => {
    const isNode = wrapperAbs.endsWith(".mjs") || wrapperAbs.endsWith(".js");
    const cmd = isNode ? process.execPath : "bash";
    const child = spawn(cmd, [wrapperAbs, JSON.stringify(args)], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`视频生成失败 (exit ${code}): ${(err || out).slice(-600)}`));
      const lastLine = out.trim().split("\n").filter(Boolean).pop() || "";
      resolve(lastLine.trim());
    });
  });
}
