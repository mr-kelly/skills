import fs from "node:fs/promises";
import path from "node:path";
import { GENERATED_DIR, STORYBOARD_IMAGE_DIR } from "./paths.ts";
import { loadProject, saveProject } from "./project-store.ts";
import { statePayload } from "./state.ts";
import { slug } from "./utils.ts";

const VIDEO_DIR = path.join(GENERATED_DIR, "videos");
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

// Upload an image or video for a shot from the browser as base64. Appended as a
// non-destructive candidate (same shape as AI-generated ones) and made active, so
// uploaded and generated assets live side by side and you pick which to use.
interface ShotAssetUpload {
  shot_id?: string;
  kind?: string;
  data_base64?: string;
  filename?: string;
  [key: string]: unknown;
}

export async function uploadShotAsset(input: ShotAssetUpload = {}) {
  const shotId = String(input.shot_id || "");
  const kind = input.kind === "video" ? "video" : "image";
  const raw = String(input.data_base64 || "");
  if (!raw) throw new Error("缺少文件数据。");
  const buf = Buffer.from(raw.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!buf.length) throw new Error("文件为空。");

  const project = await loadProject();
  const shot = (project.shots || []).find((s) => s.id === shotId);
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);

  const isVideo = kind === "video";
  const ext = path.extname(String(input.filename || "")).toLowerCase() || (isVideo ? ".mp4" : ".png");
  const allowed = isVideo ? VIDEO_EXT : IMAGE_EXT;
  if (!allowed.has(ext)) throw new Error(`不支持的${isVideo ? "视频" : "图片"}格式: ${ext}`);

  const dir = isVideo ? VIDEO_DIR : STORYBOARD_IMAGE_DIR;
  const sub = isVideo ? "videos" : "storyboards";
  await fs.mkdir(dir, { recursive: true });
  const filename = `${slug(shotId)}-upload-${Date.now()}${ext}`;
  await fs.writeFile(path.join(dir, filename), buf);
  const publicPath = `/generated/${sub}/${filename}`;
  const generatedAt = new Date().toISOString();
  const generation = { mode: "upload", source: String(input.filename || "") };
  const candidate = { path: publicPath, generated_at: generatedAt, generation };

  project.shots = (project.shots || []).map((s) => {
    if (s.id !== shotId) return s;
    if (isVideo) {
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
        video_candidates: [...prior, candidate],
        video_asset: publicPath,
        video_generated_at: generatedAt,
        video_generation: generation,
      };
    }
    const prior = s.image_candidates?.length
      ? s.image_candidates
      : s.image_asset?.startsWith("/generated/")
        ? [
            {
              path: s.image_asset,
              generated_at: s.image_generated_at || generatedAt,
              generation: s.image_generation || {},
            },
          ]
        : [];
    return {
      ...s,
      image_candidates: [...prior, candidate],
      image_asset: publicPath,
      image_generated_at: generatedAt,
      image_generation: generation,
    };
  });
  await saveProject(project);
  return { path: publicPath, state: await statePayload() };
}
