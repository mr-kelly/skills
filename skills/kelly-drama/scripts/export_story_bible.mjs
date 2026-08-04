#!/usr/bin/env node
// Export the story bible as Markdown. Ported from the retired
// scripts/export_story_bible.ts: reads from Busabase instead of the local
// data provider, same markdown shape and CLI contract (an optional
// positional path still reads a raw project.json directly — useful for
// exporting a project snapshot without a live Busabase session).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, parseJsonArray, readAllRecords } from "./lib/drama-busabase.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT_DIR = path.join(SKILL_DIR, "exports");

async function loadFromBusabase() {
  const { client, basesByKey } = await connect();
  const [projectRows, characterRows, relationshipRows, episodeRows, shotRows] = await Promise.all([
    readAllRecords(client, basesByKey.get("project")),
    readAllRecords(client, basesByKey.get("characters")),
    readAllRecords(client, basesByKey.get("relationships")),
    readAllRecords(client, basesByKey.get("episodes")),
    readAllRecords(client, basesByKey.get("shots")),
  ]);
  const projectRow = projectRows[0] || {};
  return {
    series: {
      title: projectRow.title,
      logline: projectRow.logline,
      genre: projectRow.genre,
      format: projectRow.format,
      audience: projectRow.audience,
      hook_rules: parseJsonArray(projectRow.hook_rules_json),
      world_rules: parseJsonArray(projectRow.world_rules_json),
    },
    characters: characterRows
      .filter((row) => row.deleted !== "true")
      .map((row) => ({
        id: row.character_id,
        name: row.name,
        role: row.role,
        actor_profile: row.actor_profile,
        character_card: {
          identity: row.card_identity,
          motivation: row.card_motivation,
          secret: row.card_secret,
          arc: row.card_arc,
        },
        visual: {
          anchors: parseJsonArray(row.visual_anchors_json),
          forbidden_drift: parseJsonArray(row.visual_forbidden_drift_json),
        },
      })),
    relationships: relationshipRows
      .filter((row) => row.deleted !== "true")
      .map((row) => ({
        from: row.from_character_id,
        to: row.to_character_id,
        type: row.type,
        public_status: row.public_status,
        hidden_truth: row.hidden_truth,
        conflict: row.conflict,
      })),
    episodes: episodeRows
      .filter((row) => row.deleted !== "true")
      .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
      .map((row) => ({
        id: row.episode_id,
        number: Number(row.number) || 0,
        title: row.title,
        promise: row.promise,
        cliffhanger: row.cliffhanger,
        beats: parseJsonArray(row.beats_json),
      })),
    shots: shotRows
      .filter((row) => row.deleted !== "true")
      .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
      .map((row) => ({
        id: row.shot_id,
        episode_id: row.episode_id,
        title: row.title,
        characters: parseJsonArray(row.characters_json),
        prompt: row.prompt,
        negative_prompt: row.negative_prompt,
      })),
  };
}

function lines(items) {
  return (items || []).map((item) => `- ${item}`).join("\n");
}

function characterName(project, id) {
  return (project.characters || []).find((character) => character.id === id)?.name || id;
}

async function main() {
  const explicitPath = process.argv[2];
  const project = explicitPath
    ? JSON.parse(await fs.readFile(path.resolve(explicitPath), "utf8"))
    : await loadFromBusabase();
  const series = project.series || {};

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
    out.push(`### ${characterName(project, relationship.from)} -> ${characterName(project, relationship.to)}`);
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
    out.push(`- Characters: ${(shot.characters || []).map((id) => characterName(project, id)).join(", ")}`);
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
