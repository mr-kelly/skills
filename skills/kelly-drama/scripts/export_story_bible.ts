#!/usr/bin/env node
// Export the story bible as Markdown. With no argument the project loads through
// the selected data provider (local or busabase); pass a path to export a
// specific project.json file instead.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider } from "../lib/data-provider/index.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const EXPORT_DIR = path.join(SKILL_DIR, "exports");

const project = process.argv[2]
  ? JSON.parse(await fs.readFile(path.resolve(process.argv[2]), "utf8"))
  : await (await createProvider()).loadProject();
const series = project.series || {};

function lines(items) {
  return (items || []).map((item) => `- ${item}`).join("\n");
}

function characterName(id) {
  return (project.characters || []).find((character) => character.id === id)?.name || id;
}

const out = [];
out.push(`# ${series.title || "Untitled Drama"}`);
out.push("");
out.push(`**Logline:** ${series.logline || ""}`);
out.push("");
out.push(`**Genre:** ${series.genre || ""}`);
out.push(`**Format:** ${series.format || ""}`);
out.push(`**Audience:** ${series.audience || ""}`);
out.push("");
out.push("## Hook Rules");
out.push(lines(series.hook_rules));
out.push("");
out.push("## World Rules");
out.push(lines(series.world_rules));
out.push("");
out.push("## Characters");
for (const character of project.characters || []) {
  const card = character.character_card || {};
  const visual = character.visual || {};
  out.push(`### ${character.name} (${character.id})`);
  out.push(`- Role: ${character.role || ""}`);
  out.push(`- Actor: ${character.actor_profile || ""}`);
  out.push(`- Identity: ${card.identity || ""}`);
  out.push(`- Motivation: ${card.motivation || ""}`);
  out.push(`- Secret: ${card.secret || ""}`);
  out.push(`- Arc: ${card.arc || ""}`);
  out.push(`- Visual anchors: ${(visual.anchors || []).join(", ")}`);
  out.push(`- Forbidden drift: ${(visual.forbidden_drift || []).join(", ")}`);
  out.push("");
}
out.push("## Relationships");
for (const relationship of project.relationships || []) {
  out.push(`### ${characterName(relationship.from)} -> ${characterName(relationship.to)}`);
  out.push(`- Type: ${relationship.type || ""}`);
  out.push(`- Public: ${relationship.public_status || ""}`);
  out.push(`- Hidden: ${relationship.hidden_truth || ""}`);
  out.push(`- Conflict: ${relationship.conflict || ""}`);
  out.push("");
}
out.push("## Episodes");
for (const episode of project.episodes || []) {
  out.push(`### EP${episode.number}: ${episode.title}`);
  out.push(`- Promise: ${episode.promise || ""}`);
  out.push(`- Cliffhanger: ${episode.cliffhanger || ""}`);
  for (const beat of episode.beats || []) {
    out.push(`  - ${beat.label || beat.id}: ${beat.hook || ""} / ${beat.turn || ""}`);
  }
  out.push("");
}
out.push("## Storyboard Prompts");
for (const shot of project.shots || []) {
  out.push(`### ${shot.title} (${shot.id})`);
  out.push(`- Episode: ${shot.episode_id}`);
  out.push(`- Characters: ${(shot.characters || []).map(characterName).join(", ")}`);
  out.push(`- Prompt: ${shot.prompt || ""}`);
  out.push(`- Negative: ${shot.negative_prompt || ""}`);
  out.push("");
}

await fs.mkdir(EXPORT_DIR, { recursive: true });
const safeTitle =
  String(series.title || "kelly-drama")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "kelly-drama";
const outputPath = path.join(EXPORT_DIR, `${safeTitle}-story-bible.md`);
await fs.writeFile(outputPath, `${out.join("\n")}\n`, "utf8");
console.log(`Exported story bible: ${outputPath}`);
