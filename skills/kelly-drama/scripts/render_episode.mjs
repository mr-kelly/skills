#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  connect,
  downloadAssetToFile,
  parseJsonArray,
  readAllRecords,
  uploadAssetFromFile,
  upsert,
} from "./lib/drama-busabase.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const value = (args, name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${code}): ${stderr.trim().slice(-1600)}`));
    });
  });
}

async function hasAudio(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      file,
    ]);
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Boolean(stdout.trim())) : reject(new Error("ffprobe failed"))));
  });
}

function parseClock(value) {
  const match = String(value).match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4].padEnd(3, "0")) / 1000;
}

function clock(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function episodeSrt(shots) {
  const cues = [];
  let offset = 0;
  for (const shot of shots) {
    const duration = Number(shot.duration_seconds) || 8;
    for (const cue of parseJsonArray(shot.srt_json)) {
      const match = String(cue.time || "").match(/(.+?)\s*-->\s*(.+)/);
      if (!match) continue;
      let start = parseClock(match[1]);
      let end = parseClock(match[2]);
      if (offset > 0 && start < offset - 0.1) {
        start += offset;
        end += offset;
      }
      cues.push({ start, end, text: cue.text || "" });
    }
    offset += duration;
  }
  return cues.map((cue, index) => `${index + 1}\n${clock(cue.start)} --> ${clock(cue.end)}\n${cue.text}`).join("\n\n");
}

function episodeFields(row) {
  return {
    episode_id: row.episode_id,
    project_id: row.project_id,
    number: row.number ?? 0,
    title: row.title || "",
    status: row.status || "draft",
    hyperframe_composition: row.hyperframe_composition || "",
    hyperframe_video_asset: row.hyperframe_video_asset || "",
    summary: row.summary || "",
    promise: row.promise || "",
    a_plot: row.a_plot || "",
    b_plot: row.b_plot || "",
    cliffhanger: row.cliffhanger || "",
    beats_json: row.beats_json || "[]",
    deleted: row.deleted || "false",
  };
}

async function normalizeShot({ input, output, duration, width, height, image }) {
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p`;
  const common = [
    "-t",
    String(duration),
    "-vf",
    filter,
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  ];
  if (image) {
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-loop",
      "1",
      "-i",
      input,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      ...common,
    ]);
    return;
  }
  if (await hasAudio(input)) {
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, ...common]);
  } else {
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      ...common,
    ]);
  }
}

export async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const projectId = value(args, "--project");
  const episodeId = value(args, "--episode");
  if (!projectId || !episodeId) throw new Error("Usage: render_episode.mjs --project <id> --episode <id> [--apply]");

  const { client, basesByKey } = await connect();
  const [projectRows, episodeRows, shotRows] = await Promise.all([
    readAllRecords(client, basesByKey.get("project")),
    readAllRecords(client, basesByKey.get("episodes")),
    readAllRecords(client, basesByKey.get("shots")),
  ]);
  const project = projectRows.find((row) => row.project_id === projectId && row.deleted !== "true");
  const episode = episodeRows.find(
    (row) => row.project_id === projectId && row.episode_id === episodeId && row.deleted !== "true",
  );
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  if (!episode) throw new Error(`Unknown episode ${episodeId} in project ${projectId}`);
  if (!["approved", "done"].includes(episode.status)) {
    throw new Error(`Episode ${episodeId} must be approved before assembly.`);
  }
  const shots = shotRows
    .filter((row) => row.project_id === projectId && row.episode_id === episodeId && row.deleted !== "true")
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  if (!shots.length) throw new Error("Episode has no shots.");
  const unlocked = shots.filter((shot) => !["approved", "done"].includes(shot.status));
  if (unlocked.length) {
    throw new Error(`Shots must be approved before assembly: ${unlocked.map((shot) => shot.shot_id).join(", ")}`);
  }
  const missing = shots.filter(
    (shot) => !shot.video_asset_id && !(shot.image_asset_id && shot.image_status === "approved"),
  );
  if (missing.length)
    throw new Error(`Shots missing video or approved image: ${missing.map((shot) => shot.shot_id).join(", ")}`);

  const totalSeconds = shots.reduce((sum, shot) => sum + (Number(shot.duration_seconds) || 8), 0);
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          project_id: projectId,
          episode_id: episodeId,
          shots: shots.length,
          duration_seconds: totalSeconds,
        },
        null,
        2,
      ),
    );
    return;
  }

  const landscape = String(project.visual_aspect_ratio || shots[0].aspect_ratio || "").includes("16:9");
  const [width, height] = landscape ? [1280, 720] : [720, 1280];
  const work = path.join(SKILL_DIR, "app", ".cache", "episode-renders", projectId, episodeId);
  const outputDir = path.join(SKILL_DIR, "exports", projectId);
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  const segments = [];
  for (const [index, shot] of shots.entries()) {
    const image = !shot.video_asset_id;
    const assetId = image ? shot.image_asset_id : shot.video_asset_id;
    const input = path.join(work, `source-${String(index).padStart(3, "0")}${image ? ".png" : ".mp4"}`);
    const output = path.join(work, `segment-${String(index).padStart(3, "0")}.mp4`);
    await downloadAssetToFile(client, assetId, input);
    await normalizeShot({ input, output, duration: Number(shot.duration_seconds) || 8, width, height, image });
    segments.push(output);
  }
  const concatFile = path.join(work, "concat.txt");
  await fs.writeFile(concatFile, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  const output = path.join(outputDir, `${episodeId}-rough-cut.mp4`);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatFile,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    output,
  ]);
  const srtPath = path.join(outputDir, `${episodeId}-rough-cut.srt`);
  await fs.writeFile(srtPath, `${episodeSrt(shots)}\n`);
  const uploaded = await uploadAssetFromFile(client, output, "video/mp4", `kelly-drama/${projectId}/episodes`);
  await upsert(
    client,
    basesByKey.get("episodes"),
    "episode-id",
    episodeId,
    {
      ...episodeFields(episode),
      hyperframe_video_asset: uploaded.assetId,
    },
    `Assemble rough cut for ${episodeId}`,
  );
  console.log(
    JSON.stringify(
      {
        project_id: projectId,
        episode_id: episodeId,
        output,
        srt: srtPath,
        asset_id: uploaded.assetId,
        duration_seconds: totalSeconds,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
