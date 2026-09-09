#!/usr/bin/env node
// Create one project row in the multi-project Kelly Drama workspace.
// Content rows are created by a project-specific seed script or through the app.
import { connect, findRecord, upsert } from "./lib/drama-busabase.mjs";

const value = (name, fallback = "") => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || fallback : fallback;
};
const apply = process.argv.includes("--apply");
const projectId = value("--id");
const title = value("--title", projectId);
if (!projectId || !title) throw new Error("Usage: create_project.mjs --apply --id <id> --title <title>");

const { client, basesByKey } = await connect();
const existing = await findRecord(client, basesByKey.get("project"), "project-id", projectId);
if (existing) throw new Error(`Project already exists: ${projectId}`);
const fields = {
  project_id: projectId,
  title,
  logline: value("--logline"),
  genre: value("--genre"),
  platform: value("--platform"),
  format: value("--format"),
  tone: value("--tone"),
  audience: value("--audience"),
  hook_rules_json: "[]",
  world_rules_json: "[]",
  hyperframe_project_path: "",
  hyperframe_status_json: "{}",
  hyperframe_status_updated_at: "",
  visual_format_note: "",
  visual_realism_target: "",
  visual_cinematography: "",
  visual_color_palette: "",
  visual_period_detail: "",
  visual_aspect_ratio: "9:16",
  visual_orientation: "vertical",
  visual_style_medium: "",
  visual_background_refs_json: "[]",
  updated_at: new Date().toISOString(),
};

if (apply)
  await upsert(client, basesByKey.get("project"), "project-id", projectId, fields, `Create project ${projectId}`);
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", project: fields }, null, 2));
