#!/usr/bin/env node
// Add project ownership to legacy rows without changing their content.
// Existing single-project workspaces are assigned to the default project id;
// new projects use their own project-id across every content Base.
import { connect, readAllRecords, upsert } from "./lib/drama-busabase.mjs";

const apply = process.argv.includes("--apply");
const legacyProjectId = process.argv.includes("--project-id")
  ? process.argv[process.argv.indexOf("--project-id") + 1]
  : "kelly-drama-project";
const keys = ["characters", "relationships", "episodes", "shots", "tasks"];

const { client, basesByKey } = await connect();
const plan = [];
for (const key of keys) {
  const rows = await readAllRecords(client, basesByKey.get(key));
  for (const row of rows.filter((item) => item.deleted !== "true" && !item.project_id)) {
    plan.push({
      key,
      id: row[
        `${key === "characters" ? "character" : key === "relationships" ? "relationship" : key === "episodes" ? "episode" : key === "shots" ? "shot" : "task"}-id`
      ],
    });
    if (apply) {
      const idField = {
        characters: "character-id",
        relationships: "relationship-id",
        episodes: "episode-id",
        shots: "shot-id",
        tasks: "task-id",
      }[key];
      const id = row[idField.replaceAll("-", "_")];
      await upsert(
        client,
        basesByKey.get(key),
        idField,
        id,
        { ...row, project_id: legacyProjectId },
        `Assign legacy ${key} ${id} to ${legacyProjectId}`,
      );
    }
  }
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", project_id: legacyProjectId, rows: plan }, null, 2));
