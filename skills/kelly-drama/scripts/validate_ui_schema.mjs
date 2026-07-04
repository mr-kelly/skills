#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const PROJECT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(SKILL_DIR, "app", ".data", "project.json");

function fail(errors) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

function requireString(errors, obj, field, label) {
  if (!String(obj?.[field] || "").trim()) errors.push(`${label}.${field} is required`);
}

const project = JSON.parse(await fs.readFile(PROJECT, "utf8"));
const errors = [];

for (const field of ["project_id", "series"]) {
  if (!project[field]) errors.push(`top-level ${field} is required`);
}

for (const field of ["title", "logline", "genre", "format"]) {
  requireString(errors, project.series, field, "series");
}

const characterIds = new Set();
for (const character of project.characters || []) {
  requireString(errors, character, "id", "character");
  requireString(errors, character, "name", `character ${character.id || "(missing id)"}`);
  requireString(errors, character, "role", `character ${character.id || "(missing id)"}`);
  characterIds.add(character.id);
  const visual = character.visual || {};
  for (const field of ["front", "side", "back"]) {
    requireString(errors, visual, field, `character ${character.id || "(missing id)"}.visual`);
  }
}

for (const relationship of project.relationships || []) {
  requireString(errors, relationship, "id", "relationship");
  if (!characterIds.has(relationship.from))
    errors.push(`relationship ${relationship.id} has unknown from: ${relationship.from}`);
  if (!characterIds.has(relationship.to))
    errors.push(`relationship ${relationship.id} has unknown to: ${relationship.to}`);
}

const episodeIds = new Set();
const beatIds = new Set();
for (const episode of project.episodes || []) {
  requireString(errors, episode, "id", "episode");
  requireString(errors, episode, "title", `episode ${episode.id || "(missing id)"}`);
  episodeIds.add(episode.id);
  for (const beat of episode.beats || []) {
    if (!beat.id) errors.push(`episode ${episode.id} has beat without id`);
    else beatIds.add(`${episode.id}:${beat.id}`);
  }
}

for (const shot of project.shots || []) {
  requireString(errors, shot, "id", "shot");
  if (!episodeIds.has(shot.episode_id)) errors.push(`shot ${shot.id} has unknown episode_id: ${shot.episode_id}`);
  if (shot.beat_id && !beatIds.has(`${shot.episode_id}:${shot.beat_id}`))
    errors.push(`shot ${shot.id} has unknown beat_id: ${shot.beat_id}`);
  for (const characterId of shot.characters || []) {
    if (!characterIds.has(characterId)) errors.push(`shot ${shot.id} has unknown character: ${characterId}`);
  }
}

if (errors.length) fail(errors);
console.log(`Schema OK: ${PROJECT}`);
