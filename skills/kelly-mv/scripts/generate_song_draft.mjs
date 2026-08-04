#!/usr/bin/env node
// Trusted wrapper around scripts/gen_song.py (kept as Python — see that
// file's docstring and SKILL.md's "Song Generation" section for why: local
// song-generation backends worth recommending here (SongGeneration v2/MLX,
// ACE-Step 1.5 for voice-cloned singing) are Python-ecosystem ML models with
// no equivalent Node package, so forcing a Node rewrite would mean
// reimplementing real audio-model inference instead of just calling it. This
// script owns the ONE part of the flow that must talk to Busabase: it spawns
// the Python stub, and — once an operator actually wires a backend into it —
// uploads the produced audio file as a Busabase Asset and updates the
// project record, exactly like the browser's own song-upload path.
//
// Today gen_song.py is an intentional stub (always exits 1 with a message
// telling the operator what to install), so running this script just
// surfaces that message — nothing is silently swallowed.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, readAllRecords, uploadAssetFromFile, upsert } from "./lib/mv-busabase.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/generate_song_draft.mjs [--apply] [--lyrics <text>] [--style <text>] [--duration <seconds>]

Spawns scripts/gen_song.py with a JSON arg (model/lyrics/style/duration/
output) and, once it prints a real output audio path, uploads that file as a
Busabase Asset and writes it onto the project record's song_* fields — the
same fields the browser's own MP3-upload flow writes. Without --apply this
only prints the args that would be passed to gen_song.py.`);
}

function flagValue(args, name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const apply = args.includes("--apply");

  const { client, basesByKey } = await connect();
  const settingsRows = await readAllRecords(client, basesByKey.get("settings"));
  const settings = settingsRows.find((r) => r.record_id === "config") || {};
  const backend = settings.song_draft_backend || "songgeneration-v2-mlx";

  const outputPath = path.join(SKILL_DIR, "app", ".cache", `song-draft-${Date.now()}.wav`);
  const pyArgs = {
    model: backend,
    lyrics: flagValue(args, "--lyrics", ""),
    style: flagValue(args, "--style", ""),
    voice_ref: flagValue(args, "--voice-ref", null) || null,
    duration_seconds: Number(flagValue(args, "--duration", "60")) || 60,
    output: outputPath,
  };

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", backend, args: pyArgs }, null, 2));
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const python = process.env.KELLY_MV_SONG_PYTHON || "python3";
  const scriptPath = path.join(SKILL_DIR, "scripts", "gen_song.py");
  const outPath = await new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    const child = spawn(python, [scriptPath, JSON.stringify(pyArgs)], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error((err || out).trim() || `gen_song.py exit ${code}`));
      resolve(out.trim().split("\n").filter(Boolean).pop()?.trim());
    });
  }).catch((error) => {
    console.error(`本地创歌未完成: ${error.message}`);
    process.exitCode = 1;
    return null;
  });
  if (!outPath) return;

  const { assetId } = await uploadAssetFromFile(client, outPath, "audio/wav", "kelly-mv/song");
  const projectRows = await readAllRecords(client, basesByKey.get("project"));
  const current = projectRows[0] || {};
  await upsert(
    client,
    basesByKey.get("project"),
    "project-id",
    current.project_id || "kelly-mv-project",
    {
      project_id: current.project_id || "kelly-mv-project",
      song_title: current.song_title || "",
      song_artist: current.song_artist || "",
      song_audio_asset_id: assetId,
      song_duration_seconds: pyArgs.duration_seconds,
      song_source: "generated",
      song_uploaded_at: new Date().toISOString(),
      treatment_summary: current.treatment_summary || "",
      treatment_look: current.treatment_look || "",
      treatment_aspect_ratio: current.treatment_aspect_ratio || "16:9",
      updated_at: new Date().toISOString(),
    },
    "Generated song draft",
  );
  console.log(`song draft uploaded: ${assetId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
