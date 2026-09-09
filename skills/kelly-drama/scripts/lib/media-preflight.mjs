import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ASSET_LIMIT_BYTES } from "../preflight.mjs";

export function targetVideoBitrate({ durationSeconds, limitBytes = ASSET_LIMIT_BYTES, audioBitrate = 128_000 }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Video duration must be positive.");
  const total = Math.floor((limitBytes * 0.92 * 8) / durationSeconds);
  return Math.max(250_000, total - audioBitrate);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${code}): ${stderr.trim().slice(-1200)}`));
    });
  });
}

async function durationOf(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const duration = Number.parseFloat(stdout.trim());
      if (code === 0 && Number.isFinite(duration)) resolve(duration);
      else reject(new Error(`Could not inspect video duration: ${stderr.trim()}`));
    });
  });
}

export async function prepareUploadableFile(file, mimeType, { limitBytes = ASSET_LIMIT_BYTES } = {}) {
  const original = await fs.stat(file);
  if (original.size <= limitBytes) return { path: file, temporary: false, originalBytes: original.size };
  if (!String(mimeType).startsWith("video/")) {
    throw new Error(
      `Asset is ${(original.size / 1024 / 1024).toFixed(1)} MB; Busabase limit is ${Math.floor(limitBytes / 1024 / 1024)} MB.`,
    );
  }

  const durationSeconds = await durationOf(file);
  const bitrate = targetVideoBitrate({ durationSeconds, limitBytes });
  const output = path.join(os.tmpdir(), `kelly-drama-upload-${process.pid}-${Date.now()}.mp4`);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    file,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-b:v",
    String(bitrate),
    "-maxrate",
    String(Math.floor(bitrate * 1.15)),
    "-bufsize",
    String(bitrate * 2),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  ]);
  const prepared = await fs.stat(output);
  if (prepared.size > limitBytes) {
    await fs.unlink(output).catch(() => undefined);
    throw new Error(
      `Automatic review-proxy encoding still exceeds the ${Math.floor(limitBytes / 1024 / 1024)} MB Asset limit.`,
    );
  }
  return { path: output, temporary: true, originalBytes: original.size, preparedBytes: prepared.size };
}
