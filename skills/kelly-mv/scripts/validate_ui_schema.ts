#!/usr/bin/env node
// Structural validation for a Kelly MV project.json: song, treatment, cast, shots,
// and referential integrity (shot -> character).
import fs from "node:fs/promises";
import path from "node:path";
import { createProvider } from "../lib/data-provider/index.ts";

// With an explicit path, read that file directly; otherwise load from the provider.
const SOURCE = process.argv[2] ? path.resolve(process.argv[2]) : null;

function fail(errors) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

function requireString(errors, obj, field, label) {
  if (!String(obj?.[field] || "").trim()) errors.push(`${label}.${field} is required`);
}

const project = SOURCE ? JSON.parse(await fs.readFile(SOURCE, "utf8")) : await (await createProvider()).loadProject();
const LABEL = SOURCE || `${project.project_id} (provider store)`;
const errors = [];

if (!project.project_id) errors.push("top-level project_id is required");
if (!project.song || typeof project.song !== "object") errors.push("top-level song is required");
if (!project.treatment || typeof project.treatment !== "object") errors.push("top-level treatment is required");

const song = project.song || {};
requireString(errors, song, "title", "song");

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

for (const shot of project.shots || []) {
  requireString(errors, shot, "id", "shot");
  requireString(errors, shot, "title", `shot ${shot.id || "(missing id)"}`);
  for (const characterId of shot.characters || []) {
    if (!characterIds.has(characterId)) errors.push(`shot ${shot.id} has unknown character: ${characterId}`);
  }
}

if (errors.length) fail(errors);
console.log(`Schema OK: ${LABEL}`);
