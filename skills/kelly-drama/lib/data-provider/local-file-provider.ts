// Local-file DramaProvider: the zero-dependency default.
//
// State lives under app/.data as JSON files plus generated media, exactly where
// the original app/server/{project-store,state,lock,*-service}.ts kept it. This
// provider is the offline reference implementation of the same store surface a
// remote backend (busabase) serves, so KELLY_DRAMA_DATA_PROVIDER=local|busabase
// is a config switch, not a rewrite of the UI, services, or scripts.
//
// The `/api/state` payload and the on-disk `.data/*.json` files are byte-identical
// to the pre-refactor app: this module is the same fs logic behind an interface.

import fs from "node:fs/promises";
import path from "node:path";
import {
  ACTIVE_PROJECT_PATH,
  DATA_DIR,
  GENERATED_DIR,
  IMAGE_CONFIG_PATH,
  LOCK_PATH,
  PROJECT_PATH,
  STARTER_PROJECT_PATH,
  TTS_CONFIG_PATH,
  VIDEO_CONFIG_PATH,
} from "../paths.ts";
import type { ActiveProjectState, ConfigBlob, HttpError, LockState, Project, ProviderMeta } from "../types.ts";
import type { ConfigName } from "./provider-interface.ts";

function utcNow() {
  return new Date().toISOString();
}

async function pathExists(pathname: string) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function readJson(pathname: string, fallback: unknown = null) {
  try {
    return JSON.parse(await fs.readFile(pathname, "utf8"));
  } catch (error) {
    if (fallback !== null && (error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(pathname: string, value: unknown) {
  await fs.mkdir(path.dirname(pathname), { recursive: true });
  await fs.writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// Normalize the project document. Identical to the original
// project-store.normalizeProject so saved files stay byte-identical.
export function normalizeProject(project: unknown): Project {
  const safe = project && typeof project === "object" ? (project as Record<string, unknown>) : {};
  return {
    project_id: String(safe.project_id || "kelly-drama-project"),
    updated_at: (safe.updated_at as string) || utcNow(),
    projects: Array.isArray(safe.projects) ? safe.projects : [],
    library: safe.library && typeof safe.library === "object" ? (safe.library as Record<string, unknown>) : {},
    series: safe.series && typeof safe.series === "object" ? (safe.series as Record<string, unknown>) : {},
    characters: Array.isArray(safe.characters) ? safe.characters : [],
    relationships: Array.isArray(safe.relationships) ? safe.relationships : [],
    episodes: Array.isArray(safe.episodes) ? safe.episodes : [],
    shots: Array.isArray(safe.shots) ? safe.shots : [],
    tasks: Array.isArray(safe.tasks) ? safe.tasks : [],
  };
}

const CONFIG_PATHS: Record<ConfigName, string> = {
  image: IMAGE_CONFIG_PATH,
  video: VIDEO_CONFIG_PATH,
  tts: TTS_CONFIG_PATH,
};

function absFromPublic(publicPath: string) {
  return path.join(GENERATED_DIR, String(publicPath).replace(/^\/generated\//, ""));
}

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  return {
    kind: "local",

    async ensureProject() {
      await fs.mkdir(DATA_DIR, { recursive: true });
      if (await pathExists(PROJECT_PATH)) return;
      const starter = await readJson(STARTER_PROJECT_PATH);
      starter.updated_at = utcNow();
      await writeJson(PROJECT_PATH, starter);
    },

    async loadProject(): Promise<Project> {
      await this.ensureProject();
      return normalizeProject(await readJson(PROJECT_PATH));
    },

    async saveProject(project: unknown): Promise<Project> {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const normalized = normalizeProject(project);
      normalized.updated_at = utcNow();
      await writeJson(PROJECT_PATH, normalized);
      return normalized;
    },

    async loadActiveProject(): Promise<ActiveProjectState> {
      return (await pathExists(ACTIVE_PROJECT_PATH)) ? await readJson(ACTIVE_PROJECT_PATH, {}) : {};
    },

    async saveActiveProject(state: ActiveProjectState): Promise<ActiveProjectState> {
      await writeJson(ACTIVE_PROJECT_PATH, state);
      return state;
    },

    async loadConfigBlob(name: ConfigName): Promise<ConfigBlob> {
      const pathname = CONFIG_PATHS[name];
      if (!pathname) throw new Error(`Unknown config blob: ${name}`);
      return (await pathExists(pathname)) ? await readJson(pathname, {}) : {};
    },

    async saveConfigBlob(name: ConfigName, value: ConfigBlob): Promise<ConfigBlob> {
      const pathname = CONFIG_PATHS[name];
      if (!pathname) throw new Error(`Unknown config blob: ${name}`);
      await writeJson(pathname, value);
      return value;
    },

    async getLock(): Promise<LockState> {
      if (!(await pathExists(LOCK_PATH))) return { locked: false };
      try {
        return { locked: true, ...(await readJson(LOCK_PATH)) };
      } catch {
        return { locked: true, message: "Local project files are locked." };
      }
    },

    async assertUnlocked() {
      if (await pathExists(LOCK_PATH)) {
        const error: HttpError = new Error("Project files are locked by the agent.");
        error.statusCode = 423;
        throw error;
      }
    },

    async readGeneratedAsset(publicPath: string): Promise<Buffer> {
      return fs.readFile(absFromPublic(publicPath));
    },

    async writeGeneratedAsset(publicPath: string, bytes: Buffer) {
      const abs = absFromPublic(publicPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, bytes);
    },

    async generatedAssetExists(publicPath: string) {
      return pathExists(absFromPublic(publicPath));
    },

    configSummary() {
      return {
        provider: "local",
        config_source: meta.source || null,
        data_dir: DATA_DIR,
        generated_dir: GENERATED_DIR,
      };
    },
  };
}
