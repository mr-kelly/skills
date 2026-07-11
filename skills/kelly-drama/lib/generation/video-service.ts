import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, GENERATED_DIR } from "../../app/server/paths.ts";
import { loadProject, saveProject } from "../../app/server/project-store.ts";
import { getProvider } from "../../app/server/provider.ts";
import { pathExists, slug } from "../../app/server/utils.ts";

const VIDEO_DIR = path.join(GENERATED_DIR, "videos");

// Draft: local LTX (Apple Silicon). Prod: Seedance 2.0 — see stub below.
const DEFAULT_VIDEO_CONFIG = {
  draft_backend: "ltx-video-mps", // official Lightricks/LTX-Video (0.9.x, MPS), local headless
  // wrapper receives JSON args on argv[2] and must print the output .mp4 path as the LAST stdout line
  draft_wrapper: "scripts/gen_draft_video.ts",
  width: 512, // 16:9, divisible by 32 (512x288). Bump to 1024x576 for nicer drafts.
  height: 288,
  fps: 24,
  max_frames: 121, // (8*15+1) ≈ 5s draft cap to keep local gen fast
  // PROD MODE — Seedance 2.0 via BytePlus/Volcengine Ark API (async submit→poll→download)
  prod_backend: "seedance-2.0-ark",
  ark_base_url: "https://ark.ap-southeast.bytepluses.com/api/v3",
  ark_model: "dreamina-seedance-2-0-260128",
  ark_api_key: "", // local-only; set in .data/video_config.json
  prod_resolution: "720p", // 480p|720p|1080p|2K
  prod_ratio: "16:9", // or "adaptive" to keep the keyframe's dims
  prod_watermark: false,
  generate_audio: true, // Seedance native synced audio; auto-falls back to silent if the audio filter blocks a shot
};

async function loadVideoConfig() {
  const disk = await (await getProvider()).loadConfigBlob("video");
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

function prodPrompt(shot) {
  return [shot.video_prompt, shot.action].filter(Boolean).join(" ") || shot.composition || shot.title || shot.id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PROD MODE — Seedance 2.0 via Ark image-to-video (submit task → poll → download mp4).
export async function generateShotVideoProd(shotId) {
  const cfg = await loadVideoConfig();
  if (!cfg.ark_api_key) throw new Error("Seedance/Ark API Key 未配置（在 .data/video_config.json 设置 ark_api_key）。");
  const project = await loadProject();
  const shot = (project.shots || []).find((s) => s.id === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);
  const base = String(cfg.ark_base_url).replace(/\/+$/, "");
  const duration = Math.max(4, Math.min(Number(shot.duration_seconds) || 5, 15));
  const headers = { Authorization: `Bearer ${cfg.ark_api_key}`, "Content-Type": "application/json" };
  const provider = await getProvider();
  const textPart = { type: "text", text: prodPrompt(shot) };
  const hasImage =
    shot.image_asset?.startsWith("/generated/") && (await provider.generatedAssetExists(shot.image_asset));
  const i2vContent = hasImage
    ? [
        textPart,
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${(await provider.readGeneratedAsset(shot.image_asset)).toString("base64")}`,
          },
        },
      ]
    : null;
  const t2vContent = [textPart];

  const submit = async (content, generate_audio) => {
    const r = await fetch(`${base}/contents/generations/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.ark_model,
        content,
        ratio: cfg.prod_ratio,
        duration,
        resolution: cfg.prod_resolution,
        watermark: cfg.prod_watermark,
        generate_audio,
      }),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, id: d.id, err: d?.error?.message || d?.message || `HTTP ${r.status}` };
  };
  const poll = async (taskId) => {
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(5000);
      const p = await fetch(`${base}/contents/generations/tasks/${taskId}`, { headers });
      const pd = await p.json().catch(() => ({}));
      if (pd?.status === "succeeded") return { url: pd?.content?.video_url || "" };
      if (["failed", "cancelled", "expired"].includes(pd?.status))
        return { fail: `${pd.status}: ${pd?.error?.message || ""}` };
    }
    return { fail: "timeout" };
  };
  const attempt = async (content, generate_audio) => {
    const s = await submit(content, generate_audio);
    if (!s.ok || !s.id) return { submitErr: s.err };
    const r = await poll(s.id);
    return r.url ? { url: r.url } : { pollErr: r.fail };
  };

  // Default: generate WITH native audio. NO real-person→text-to-video fallback — if the
  // keyframe is rejected as a real person, surface the error (don't silently degrade
  // image-to-video consistency). Only fallback kept: audio-sensitive → retry silent.
  const wantAudio = cfg.generate_audio !== false;
  const method = hasImage ? "image-to-video" : "text-to-video";
  let audioOn = wantAudio;
  const content = i2vContent || t2vContent;

  let res = await attempt(content, wantAudio);
  if (res.pollErr && /audio|sensitiv|敏感/i.test(res.pollErr) && wantAudio) {
    audioOn = false;
    res = await attempt(content, false);
  }
  if (res.submitErr) throw new Error(`Seedance 提交失败: ${res.submitErr}`);
  if (res.pollErr) throw new Error(`Seedance 任务失败: ${res.pollErr}`);
  const videoUrl = res.url;
  if (!videoUrl) throw new Error("Seedance 未产出视频。");

  // 3) download
  const resp = await fetch(videoUrl);
  if (!resp.ok) throw new Error(`下载成片失败: ${resp.status}`);
  const bytes = Buffer.from(await resp.arrayBuffer());
  const filename = `${slug(shot.id)}-prod-${Date.now()}.mp4`;
  const publicPath = `/generated/videos/${filename}`;
  await provider.writeGeneratedAsset(publicPath, bytes);
  const generatedAt = new Date().toISOString();
  const generation = {
    mode: "prod",
    backend: cfg.prod_backend,
    model: cfg.ark_model,
    method,
    audio: audioOn,
    resolution: cfg.prod_resolution,
    ratio: cfg.prod_ratio,
    duration,
    source_image: method === "image-to-video" ? shot.image_asset : "",
  };

  project.shots = (project.shots || []).map((s) => {
    if (s.id !== shot.id) return s;
    const prior = s.video_candidates?.length
      ? s.video_candidates
      : s.video_asset?.startsWith("/generated/")
        ? [
            {
              path: s.video_asset,
              generated_at: s.video_generated_at || generatedAt,
              generation: s.video_generation || {},
            },
          ]
        : [];
    return {
      ...s,
      video_candidates: [...prior, { path: publicPath, generated_at: generatedAt, generation }],
      video_asset: publicPath,
      video_generated_at: generatedAt,
      video_generation: generation,
    };
  });
  await saveProject(project);
  return { path: publicPath, state: await import("../../app/server/state.ts").then((m) => m.statePayload()) };
}

// Draft mode is local-only: it spawns the LTX-Video Python wrapper, which reads
// the keyframe and writes the mp4 as real files on disk under .data/generated.
// Absolute-path fs is intentional here (a subprocess cannot use the provider
// seam); config still loads through the provider.
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
  if (!(await pathExists(outPath))) throw new Error("视频生成未产出文件，见日志。");

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
    const prior = s.video_candidates?.length
      ? s.video_candidates
      : s.video_asset?.startsWith("/generated/")
        ? [
            {
              path: s.video_asset,
              generated_at: s.video_generated_at || generatedAt,
              generation: s.video_generation || {},
            },
          ]
        : [];
    const video_candidates = [...prior, { path: publicPath, generated_at: generatedAt, generation }];
    return {
      ...s,
      video_candidates,
      video_asset: publicPath,
      video_generated_at: generatedAt,
      video_generation: generation,
    };
  });
  await saveProject(project);
  return { path: publicPath, state: await import("../../app/server/state.ts").then((m) => m.statePayload()) };
}

function runWrapper(wrapperAbs, args): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const isNode = wrapperAbs.endsWith(".ts") || wrapperAbs.endsWith(".js");
    const cmd = isNode ? process.execPath : "bash";
    const child = spawn(cmd, [wrapperAbs, JSON.stringify(args)], { stdio: ["ignore", "pipe", "pipe"] });
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
      if (code !== 0) return reject(new Error(`视频生成失败 (exit ${code}): ${(err || out).slice(-600)}`));
      const lastLine = out.trim().split("\n").filter(Boolean).pop() || "";
      resolve(lastLine.trim());
    });
  });
}
