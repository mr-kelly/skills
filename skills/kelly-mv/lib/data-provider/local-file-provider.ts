// Local-file MvDataProvider: the zero-dependency default.
//
// This is the offline reference implementation of the kelly-mv store surface.
// Project state lives in app/.data/project.json; per-workspace config in
// app/.data/{image,song,video}_config.json; the active-project pointer in
// app/.data/active_project.json; the agent write-lock in app/.data/agent.lock;
// and generated/uploaded media under app/.data/generated/. Selecting
// KELLY_MV_DATA_PROVIDER=local|busabase is a config switch, not a rewrite of
// the UI, services, or scripts.
//
// All fs access for the kelly-mv store lives here (moved out of the old
// app/server/project-store.ts + lock.ts + the config/media reads scattered in
// the services). File serving that touches disk stays behind this provider and
// is understood to be Node-only until a remote provider serves it.

import fs from "node:fs/promises";
import path from "node:path";
import { generatedRelPath, normalizeProject, pathExists, readJson, utcNow, writeJson } from "../common.ts";
import {
  activeProjectPath,
  dataDir,
  generatedDir,
  imageConfigPath,
  lockPath,
  projectPath,
  songConfigPath,
  starterProjectPath,
  videoConfigPath,
} from "../paths.ts";
import type {
  ActiveProjectState,
  ImageConfig,
  LockState,
  Project,
  ProviderMeta,
  SongConfig,
  VideoConfig,
} from "../types.ts";
import type { GeneratedResult, GeneratedWrite, MvDataProvider } from "./provider-interface.ts";

export function createLocalFileProvider(meta: ProviderMeta = {}): MvDataProvider {
  async function ensureDirs() {
    await fs.mkdir(dataDir, { recursive: true });
  }

  function absFor(publicPath: string): string {
    return path.join(generatedDir, generatedRelPath(publicPath));
  }

  const provider: MvDataProvider = {
    name: "local",

    async ensureProject() {
      await ensureDirs();
      if (await pathExists(projectPath)) return;
      const starter = await readJson<Record<string, unknown>>(starterProjectPath);
      starter.updated_at = utcNow();
      await writeJson(projectPath, starter);
    },

    async loadProject() {
      await this.ensureProject();
      return normalizeProject(await readJson(projectPath)) as Project;
    },

    async saveProject(project) {
      await ensureDirs();
      const normalized = normalizeProject(project) as Project;
      normalized.updated_at = utcNow();
      await writeJson(projectPath, normalized);
      return normalized;
    },

    async getActiveProjectState() {
      if (!(await pathExists(activeProjectPath))) return {};
      return readJson<ActiveProjectState>(activeProjectPath, {});
    },

    async setActiveProjectState(state) {
      const next: ActiveProjectState = { ...state, updated_at: state.updated_at || new Date().toISOString() };
      await writeJson(activeProjectPath, next);
      return next;
    },

    async readImageConfig() {
      if (!(await pathExists(imageConfigPath))) return {};
      return readJson<ImageConfig>(imageConfigPath, {});
    },

    async writeImageConfig(config) {
      await writeJson(imageConfigPath, config);
    },

    async readSongConfig() {
      if (!(await pathExists(songConfigPath))) return {};
      return readJson<SongConfig>(songConfigPath, {});
    },

    async readVideoConfig() {
      if (!(await pathExists(videoConfigPath))) return {};
      return readJson<Partial<VideoConfig>>(videoConfigPath, {});
    },

    async getLock() {
      if (!(await pathExists(lockPath))) return { locked: false };
      try {
        return { locked: true, ...(await readJson<Record<string, unknown>>(lockPath)) } as LockState;
      } catch {
        return { locked: true, message: "Local project files are locked." };
      }
    },

    async assertUnlocked() {
      if (await pathExists(lockPath)) throw new Error("Project files are locked by the agent.");
    },

    async writeGenerated({ subdir, filename, bytes }: GeneratedWrite): Promise<GeneratedResult> {
      const dir = path.join(generatedDir, subdir);
      await fs.mkdir(dir, { recursive: true });
      const absPath = path.join(dir, filename);
      await fs.writeFile(absPath, bytes);
      return { publicPath: `/generated/${subdir}/${filename}`, absPath };
    },

    async readGenerated(publicPath) {
      try {
        return await fs.readFile(absFor(publicPath));
      } catch {
        return null;
      }
    },

    async readGeneratedBytes(publicPath) {
      return this.readGenerated(publicPath);
    },

    async generatedExists(publicPath) {
      return pathExists(absFor(publicPath));
    },

    resolveGeneratedAbsPath(publicPath) {
      return absFor(publicPath);
    },

    async ensureGeneratedDir(subdir) {
      const dir = path.join(generatedDir, subdir);
      await fs.mkdir(dir, { recursive: true });
      return dir;
    },

    async copyIntoGenerated(sourceAbsPath, subdir, filename): Promise<GeneratedResult> {
      const dir = path.join(generatedDir, subdir);
      await fs.mkdir(dir, { recursive: true });
      const absPath = path.join(dir, filename);
      await fs.copyFile(sourceAbsPath, absPath);
      return { publicPath: `/generated/${subdir}/${filename}`, absPath };
    },

    configSummary() {
      return {
        provider: "local",
        config_source: meta.source || null,
        data_dir: dataDir,
        media_serving: "node-local",
      };
    },
  };

  return provider;
}
