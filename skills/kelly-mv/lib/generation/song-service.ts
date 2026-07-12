import fs from "node:fs/promises";
import path from "node:path";
import { loadProject, saveProject } from "../../app/server/project-store.ts";
import { provider } from "../../app/server/provider.ts";
import { statePayload } from "../../app/server/state.ts";
import type { Song, SongConfig } from "../../app/server/types.ts";
import { pathExists, slug } from "../../app/server/utils.ts";

interface SongPatch {
  title?: string;
  artist?: string;
  genre?: string;
  mood?: string;
  key?: string;
  lyrics?: string;
  source?: string;
  duration_seconds?: number | string;
  bpm?: number | string;
  lyric_lines?: unknown;
  generation?: Record<string, unknown>;
  audio_path?: string;
  data_base64?: string;
  filename?: string;
  [key: string]: unknown;
}

// Song generation is a documented future capability. Draft = local MLX model on Apple
// Silicon (mirrors the local-LTX draft path in video-service.ts); prod = cloud. Wiring it
// is out of scope for this pass — see generateSongDraft() and scripts/gen_song.py.
const DEFAULT_SONG_CONFIG: SongConfig = {
  // Primary local-MLX recommendation; same family as the Qwen3-TTS(mlx-audio) path drama uses.
  draft_backend: "songgeneration-v2-mlx", // mlx-community/SongGeneration-v2-large
  // Alternative with audio-prompt voice/timbre cloning ("用我 clone 的声音创歌"): "ace-step-1.5"
  draft_wrapper: "scripts/gen_song.py",
  python: ".data/song/venv/bin/python", // relative to app dir, created on first wiring
  // prod_backend: "suno-or-udio-style-cloud", // PROD MODE — not implemented
};

const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);

async function loadSongConfig() {
  const disk = await provider.readSongConfig();
  return { ...DEFAULT_SONG_CONFIG, ...disk };
}

export async function songConfigPayload() {
  const cfg = await loadSongConfig();
  return {
    draft_backend: cfg.draft_backend,
    prod_backend: cfg.prod_backend || null,
    draft_ready: false, // flips true once the local song-gen venv/model is wired
    note: "创歌为后续能力。本地草稿首选 SongGeneration v2（MLX），克隆音色用 ACE-Step 1.5。当前请导入已有歌曲。",
  };
}

// Parse a minimal subset of LRC: lines like "[00:12.34] text" become timed lyric lines.
// Plain (untimed) lyrics are kept as the raw `lyrics` string with no `lyric_lines`.
export function parseLrc(text) {
  const lines = String(text || "").split(/\r?\n/);
  const stamp = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,2}))?\]/g;
  const out = [];
  for (const line of lines) {
    stamp.lastIndex = 0;
    const times = [];
    let match: RegExpExecArray | null;
    while ((match = stamp.exec(line))) {
      const min = Number(match[1]);
      const sec = Number(match[2]);
      const frac = match[3] ? Number(`0.${match[3]}`) : 0;
      times.push(min * 60 + sec + frac);
    }
    const content = line.replace(stamp, "").trim();
    if (!content || !times.length) continue;
    for (const start of times) out.push({ start: Math.round(start * 100) / 100, text: content });
  }
  out.sort((a, b) => a.start - b.start);
  for (let i = 0; i < out.length; i += 1) {
    /** @type {any} */ (out[i]).end =
      i + 1 < out.length ? out[i + 1].start : Math.round((out[i].start + 4) * 100) / 100;
  }
  return out;
}

function mergeSong(current: Song, patch: SongPatch): Song {
  const next: Song = { ...current };
  const scalarKeys = ["title", "artist", "genre", "mood", "key", "lyrics", "source"];
  for (const key of scalarKeys) {
    if (patch[key] !== undefined) next[key] = String(patch[key]);
  }
  if (patch.duration_seconds !== undefined) next.duration_seconds = Number(patch.duration_seconds) || 0;
  if (patch.bpm !== undefined) next.bpm = Number(patch.bpm) || 0;
  if (Array.isArray(patch.lyric_lines)) next.lyric_lines = patch.lyric_lines as Song["lyric_lines"];
  if (patch.generation) next.generation = patch.generation;
  return next;
}

// Update song metadata in place. Re-parses lyric_lines from LRC when the lyrics look timed.
export async function updateSong(patch: SongPatch = {}) {
  const project = await loadProject();
  const song = mergeSong(project.song || {}, patch);
  if (patch.lyrics !== undefined && !Array.isArray(patch.lyric_lines)) {
    const parsed = parseLrc(patch.lyrics);
    if (parsed.length) song.lyric_lines = parsed;
  }
  if (!song.source) song.source = "imported";
  project.song = song;
  await saveProject(project);
  return statePayload();
}

// Import an existing audio file from a local path the user provides. Copies the file into
// .data/generated/songs/ and records it as the active song asset. No external calls.
export async function importSong(input: SongPatch = {}) {
  const audioPath = String(input.audio_path || "").trim();
  if (!audioPath) throw new Error("请提供本地音频文件路径（audio_path）。");
  const abs = path.resolve(audioPath.replace(/^~(?=\/)/, process.env.HOME || ""));
  if (!(await pathExists(abs))) throw new Error(`音频文件不存在: ${abs}`);
  const ext = path.extname(abs).toLowerCase();
  if (!AUDIO_EXT.has(ext)) throw new Error(`不支持的音频格式: ${ext}`);

  const project = await loadProject();
  const base = slug(input.title || path.basename(abs, ext) || "song");
  const filename = `${base}-${Date.now()}${ext}`;
  // The source is a user-supplied external path (not the generated store), so we
  // read it directly, then hand the bytes to the provider to persist.
  const { publicPath } = await provider.writeGenerated({ subdir: "songs", filename, bytes: await fs.readFile(abs) });

  const song = mergeSong(project.song || {}, {
    title: input.title || project.song?.title || path.basename(abs, ext),
    artist: input.artist,
    genre: input.genre,
    mood: input.mood,
    bpm: input.bpm,
    key: input.key,
    duration_seconds: input.duration_seconds,
    lyrics: input.lyrics,
  });
  song.audio_asset = publicPath;
  song.source = "imported";
  song.imported_at = new Date().toISOString();
  if (input.lyrics !== undefined && !Array.isArray(input.lyric_lines)) {
    const parsed = parseLrc(input.lyrics);
    if (parsed.length) song.lyric_lines = parsed;
  }
  project.song = song;
  await saveProject(project);
  return { path: publicPath, state: await statePayload() };
}

// Upload an MP3 (or other audio) from the browser as base64. This is the primary,
// simplest path: pick an existing track and the MV is built around it. Duration is
// read client-side from an <audio> element and passed in.
export async function uploadSong(input: SongPatch = {}) {
  const raw = String(input.data_base64 || "");
  if (!raw) throw new Error("缺少音频数据。");
  const ext = path.extname(String(input.filename || "")).toLowerCase() || ".mp3";
  if (!AUDIO_EXT.has(ext)) throw new Error(`不支持的音频格式: ${ext}`);
  const buf = Buffer.from(raw.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!buf.length) throw new Error("音频数据为空。");

  const project = await loadProject();
  const baseName = path.basename(String(input.filename || "song"), ext);
  const filename = `${slug(input.title || baseName || "song")}-${Date.now()}${ext}`;
  const { publicPath } = await provider.writeGenerated({ subdir: "songs", filename, bytes: buf });

  project.song = {
    ...(project.song || {}),
    title: input.title || project.song?.title || baseName || "未命名",
    artist: input.artist ?? project.song?.artist ?? "",
    audio_asset: publicPath,
    duration_seconds: Number(input.duration_seconds) || project.song?.duration_seconds || 0,
    source: "uploaded",
    uploaded_at: new Date().toISOString(),
  };
  await saveProject(project);
  return { path: publicPath, state: await statePayload() };
}

// PROD MODE — cloud song generation. Intentionally not implemented.
export async function generateSongProd() {
  throw new Error("prod 创歌（云端）暂未接入。");
}

// DRAFT MODE — local MLX song generation. Documented stub: returns a clear, actionable
// message instead of silently failing. Wire scripts/gen_song.py to enable.
export async function generateSongDraft() {
  const cfg = await loadSongConfig();
  throw new Error(
    `本地创歌还没接入。计划用 ${cfg.draft_backend}（SongGeneration v2，MLX，Apple Silicon），克隆音色用 ace-step-1.5。先在 ${cfg.draft_wrapper} 里接上推理，再用此按钮。当前请在「歌曲」里导入已有音频文件。`,
  );
}
