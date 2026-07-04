import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathExists, readJson } from "./utils.mjs";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm"]);
const AUDIO_EXTS = new Set([".wav", ".mp3", ".m4a", ".aac", ".ogg"]);
const execFileAsync = promisify(execFile);

async function safeStat(pathname) {
  try {
    return await fs.stat(pathname);
  } catch {
    return null;
  }
}

async function listDir(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function rel(projectPath, pathname) {
  return path.relative(projectPath, pathname) || ".";
}

function fileSummary(projectPath, pathname, stat) {
  return {
    path: rel(projectPath, pathname),
    absolute_path: pathname,
    size_bytes: stat?.size || 0,
    updated_at: stat?.mtime?.toISOString?.() || "",
  };
}

async function mediaDuration(pathname) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", pathname],
      { timeout: 3000 },
    );
    const duration = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(duration) ? duration : null;
  } catch {
    return null;
  }
}

async function videoSummary(projectPath, pathname) {
  const stat = await safeStat(pathname);
  const summary = fileSummary(projectPath, pathname, stat);
  const duration = await mediaDuration(pathname);
  if (duration !== null) summary.duration_seconds = duration;
  return summary;
}

async function collectFiles(projectPath, dir, predicate, limit = 80) {
  const out = [];
  async function walk(current, depth) {
    if (out.length >= limit || depth > 3) return;
    const entries = await listDir(current);
    for (const entry of entries) {
      if (out.length >= limit) break;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const pathname = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(pathname, depth + 1);
      } else if (predicate(pathname)) {
        const stat = await safeStat(pathname);
        out.push(fileSummary(projectPath, pathname, stat));
      }
    }
  }
  await walk(dir, 0);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function parseRootMeta(html) {
  const root = html.match(
    /data-composition-id=["']([^"']+)["'][\s\S]*?data-start=["']([^"']+)["'][\s\S]*?data-duration=["']([^"']+)["'][\s\S]*?data-width=["']([^"']+)["'][\s\S]*?data-height=["']([^"']+)["']/,
  );
  if (!root) return {};
  return {
    composition_id: root[1],
    start: Number.parseFloat(root[2]),
    duration_seconds: Number.parseFloat(root[3]),
    width: Number.parseInt(root[4], 10),
    height: Number.parseInt(root[5], 10),
  };
}

function parseScenes(html) {
  const scenes = [];
  const sceneRegex = /<div\b([^>]*\bid=["'](s\d+)["'][^>]*)class=["'][^"']*\bscene\b[^"']*["'][^>]*>/g;
  let match;
  while ((match = sceneRegex.exec(html))) {
    const attr = match[1] || "";
    const id = match[2];
    const hf = attr.match(/data-hf-id=["']([^"']+)["']/)?.[1] || "";
    const before = html.slice(Math.max(0, match.index - 260), match.index);
    const comment = before.match(/<!--\s*=+\s*([^<]+?)\s*=+\s*-->\s*$/)?.[1]?.trim() || "";
    scenes.push({ id, hf_id: hf, label: comment });
  }
  return scenes;
}

function parseAudio(html) {
  const audio = [];
  const audioRegex = /<audio\b([^>]*)>/g;
  let match;
  while ((match = audioRegex.exec(html))) {
    const attr = match[1] || "";
    const get = (name) => attr.match(new RegExp(`${name}=["']([^"']*)["']`))?.[1] || "";
    audio.push({
      id: get("id"),
      src: get("src"),
      start: Number.parseFloat(get("data-start") || "0"),
      duration_seconds: Number.parseFloat(get("data-duration") || "0"),
      track_index: Number.parseInt(get("data-track-index") || "0", 10),
    });
  }
  return audio;
}

async function compositionSummary(projectPath, relativePath) {
  const absolutePath = path.resolve(projectPath, relativePath);
  const stat = await safeStat(absolutePath);
  if (!stat) return null;
  const html = await fs.readFile(absolutePath, "utf8");
  return {
    ...fileSummary(projectPath, absolutePath, stat),
    ...parseRootMeta(html),
    scenes: parseScenes(html),
    audio: parseAudio(html),
  };
}

export async function hyperframeProjectStatus(projectPath) {
  const normalized = path.resolve(String(projectPath || "").trim());
  if (!projectPath || !(await pathExists(normalized))) {
    return {
      ok: false,
      project_path: String(projectPath || ""),
      error: "HyperFrame project path does not exist.",
    };
  }
  const stat = await safeStat(normalized);
  if (!stat?.isDirectory()) {
    return {
      ok: false,
      project_path: normalized,
      error: "HyperFrame project path is not a directory.",
    };
  }

  const manifestPath = path.join(normalized, "hyperframes.json");
  const manifest = (await pathExists(manifestPath)) ? await readJson(manifestPath, {}) : null;
  const metaPath = path.join(normalized, "meta.json");
  const meta = (await pathExists(metaPath)) ? await readJson(metaPath, {}) : null;
  const designPath = path.join(normalized, "design.md");
  const designStat = await safeStat(designPath);
  const design = designStat ? fileSummary(normalized, designPath, designStat) : null;

  const htmlFiles = await collectFiles(normalized, normalized, (pathname) => path.extname(pathname) === ".html", 60);
  const compositions = (await Promise.all(htmlFiles.map((file) => compositionSummary(normalized, file.path)))).filter(
    Boolean,
  );
  const renderFiles = await collectFiles(
    normalized,
    normalized,
    (pathname) => VIDEO_EXTS.has(path.extname(pathname).toLowerCase()),
    60,
  );
  const renders = await Promise.all(renderFiles.map((file) => videoSummary(normalized, file.absolute_path)));
  const audio = await collectFiles(
    normalized,
    path.join(normalized, "audio"),
    (pathname) => AUDIO_EXTS.has(path.extname(pathname).toLowerCase()),
    80,
  );
  const thumbnails = await collectFiles(
    normalized,
    path.join(normalized, ".thumbnails"),
    (pathname) => /\.(png|jpe?g|webp)$/i.test(pathname),
    120,
  );
  const changelogs = await collectFiles(
    normalized,
    path.join(normalized, "changelog"),
    (pathname) => path.extname(pathname) === ".md",
    40,
  );
  changelogs.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  return {
    ok: true,
    project_path: normalized,
    manifest,
    meta,
    design,
    compositions,
    renders,
    audio,
    thumbnails,
    changelogs,
    counts: {
      compositions: compositions.length,
      scenes: compositions.reduce((sum, item) => sum + (item.scenes?.length || 0), 0),
      renders: renders.length,
      audio: audio.length,
      thumbnails: thumbnails.length,
      changelogs: changelogs.length,
    },
  };
}
