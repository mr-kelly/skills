// Shared, backend-neutral helpers for the kelly-mv lib. Pure JSON/fs utilities
// and project-shape helpers used by the local provider, the server, and scripts.
// (Remote providers reimplement persistence but reuse the pure helpers.)

import fs from "node:fs/promises";
import path from "node:path";

export function utcNow(): string {
  return new Date().toISOString();
}

export async function pathExists(pathname: string): Promise<boolean> {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T = unknown>(pathname: string, fallback: T | null = null): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(pathname, "utf8")) as T;
  } catch (error) {
    if (fallback !== null && (error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(pathname: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(pathname), { recursive: true });
  await fs.writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

export function slug(value: unknown): string {
  return (
    normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item"
  );
}

// ---- project shape helpers (pure) ----

export function normalizeProject(project: unknown): Record<string, unknown> {
  const safe = project && typeof project === "object" ? (project as Record<string, unknown>) : {};
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

export function upsertById<T extends { id?: unknown }>(items: T[], item: T): T[] {
  const id = String(item.id || "");
  if (!id) throw new Error("Item id is required");
  const next = [...items];
  const index = next.findIndex((candidate) => String(candidate.id) === id);
  if (index >= 0) next[index] = { ...next[index], ...item };
  else next.push(item);
  return next;
}

// Map a `/generated/<rel>` public path to its path relative to the generated dir.
export function generatedRelPath(publicPath: string): string {
  return String(publicPath).replace(/^\/generated\//, "");
}
