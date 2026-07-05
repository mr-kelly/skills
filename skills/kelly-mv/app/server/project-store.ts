import fs from "node:fs/promises";
import { DATA_DIR, PROJECT_PATH, STARTER_PROJECT_PATH } from "./paths.ts";
import { pathExists, readJson, utcNow, writeJson } from "./utils.ts";

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function ensureProject() {
  await ensureDirs();
  if (await pathExists(PROJECT_PATH)) return;
  const starter = await readJson(STARTER_PROJECT_PATH);
  starter.updated_at = utcNow();
  await writeJson(PROJECT_PATH, starter);
}

export async function loadProject() {
  await ensureProject();
  return normalizeProject(await readJson(PROJECT_PATH));
}

export async function saveProject(project) {
  await ensureDirs();
  const normalized = normalizeProject(project);
  normalized.updated_at = utcNow();
  await writeJson(PROJECT_PATH, normalized);
  return normalized;
}

export function normalizeProject(project) {
  const safe = project && typeof project === "object" ? project : {};
  return {
    project_id: String(safe.project_id || "kelly-mv-project"),
    updated_at: safe.updated_at || utcNow(),
    projects: Array.isArray(safe.projects) ? safe.projects : [],
    library: safe.library && typeof safe.library === "object" ? safe.library : {},
    song: safe.song && typeof safe.song === "object" ? safe.song : {},
    treatment: safe.treatment && typeof safe.treatment === "object" ? safe.treatment : {},
    characters: Array.isArray(safe.characters) ? safe.characters : [],
    shots: Array.isArray(safe.shots) ? safe.shots : [],
    tasks: Array.isArray(safe.tasks) ? safe.tasks : [],
  };
}

export function upsertById(items, item) {
  const id = String(item.id || "");
  if (!id) throw new Error("Item id is required");
  const next = [...items];
  const index = next.findIndex((candidate) => String(candidate.id) === id);
  if (index >= 0) next[index] = { ...next[index], ...item };
  else next.push(item);
  return next;
}
