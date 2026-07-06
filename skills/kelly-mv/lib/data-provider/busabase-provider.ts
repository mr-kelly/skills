// Busabase MvDataProvider: a thin HTTP client to a Busabase base.
//
// Busabase (#4437) is the recommended cloud store for App-in-Skills whose
// output should become shared, canonical records. kelly-mv's unit of work is a
// music-video project (song + treatment + characters + shots + tasks) plus its
// generated media. This provider maps that surface onto a single Busabase base:
//
//   - the whole project snapshot lives in one record's commit `fields.project`
//   - image/song/video config live in that record's `fields.{image,song,video}_config`
//   - the active-project pointer lives in `fields.active_project`
//   - generated/uploaded media are stored as attachments; the returned public
//     path is a `/generated/...` URL the app proxies back through readGenerated()
//
// This is a mapping layer, not a backend rewrite: KELLY_MV_DATA_PROVIDER=busabase
// keeps the same UI, services, and scripts. Persistence is best-effort with the
// same graceful degradation as the local provider (empty starter when the base
// is unreachable), so the app boots and reports `busabase` even before a base is
// provisioned.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_MV_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_MV_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import { generatedRelPath, normalizeProject, utcNow } from "../common.ts";
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

const PROJECT_RECORD_KEY = "kelly-mv-project";

export function createBusabaseProvider(meta: ProviderMeta = {}): MvDataProvider {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_MV_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_MV_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_MV_BUSABASE_API_KEY || ""
    : process.env.KELLY_MV_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_MV_BUSABASE_URL / KELLY_MV_BUSABASE_BASE_ID.",
      );
    }
  }

  async function api(method: string, pathname: string, body?: unknown) {
    requireConfig();
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // The kelly-mv workspace is one canonical record keyed by PROJECT_RECORD_KEY.
  // Its commit fields carry the project snapshot, config, and active pointer.
  async function loadFields(): Promise<Record<string, unknown>> {
    const record = await api(
      "GET",
      `/api/v1/bases/${encodeURIComponent(baseId)}/records/${encodeURIComponent(PROJECT_RECORD_KEY)}`,
    );
    return record?.headCommit?.fields || record?.fields || {};
  }

  // Best-effort read: an empty record (or unreachable base) yields {} so the
  // app degrades to the starter project instead of erroring.
  async function loadFieldsSafe(): Promise<Record<string, unknown>> {
    return loadFields().catch(() => ({}) as Record<string, unknown>);
  }

  async function saveFields(patch: Record<string, unknown>): Promise<void> {
    const current = await loadFieldsSafe();
    await api("PUT", `/api/v1/bases/${encodeURIComponent(baseId)}/records/${encodeURIComponent(PROJECT_RECORD_KEY)}`, {
      payload: { fields: { ...current, ...patch }, message: "kelly-mv sync", author: "kelly-mv" },
    });
  }

  const provider: MvDataProvider = {
    name: "busabase",

    async ensureProject() {
      // Records are created lazily on first saveProject/saveFields. Nothing to do.
    },

    async loadProject() {
      const fields = await loadFieldsSafe();
      return normalizeProject(fields.project) as Project;
    },

    async saveProject(project) {
      const normalized = normalizeProject(project) as Project;
      normalized.updated_at = utcNow();
      await saveFields({ project: normalized });
      return normalized;
    },

    async getActiveProjectState() {
      const fields = await loadFieldsSafe();
      return (fields.active_project as ActiveProjectState) || {};
    },

    async setActiveProjectState(state) {
      const next: ActiveProjectState = { ...state, updated_at: state.updated_at || new Date().toISOString() };
      await saveFields({ active_project: next });
      return next;
    },

    async readImageConfig() {
      const fields = await loadFieldsSafe();
      return (fields.image_config as ImageConfig) || {};
    },

    async writeImageConfig(config) {
      await saveFields({ image_config: config });
    },

    async readSongConfig() {
      const fields = await loadFieldsSafe();
      return (fields.song_config as SongConfig) || {};
    },

    async readVideoConfig() {
      const fields = await loadFieldsSafe();
      return (fields.video_config as Partial<VideoConfig>) || {};
    },

    async getLock(): Promise<LockState> {
      // Busabase enforces its own concurrency via commits; no external lock file.
      return { locked: false };
    },

    async assertUnlocked() {
      // No-op: Busabase serializes writes server-side.
    },

    async writeGenerated({ subdir, filename, bytes }: GeneratedWrite): Promise<GeneratedResult> {
      const publicPath = `/generated/${subdir}/${filename}`;
      await api(
        "POST",
        `/api/v1/bases/${encodeURIComponent(baseId)}/records/${encodeURIComponent(PROJECT_RECORD_KEY)}/attachments`,
        { payload: { path: publicPath, contentBase64: Buffer.from(bytes).toString("base64") } },
      );
      return { publicPath, absPath: null };
    },

    async readGenerated(publicPath) {
      try {
        const rel = generatedRelPath(publicPath);
        const res = await fetch(
          `${baseUrl}/api/v1/bases/${encodeURIComponent(baseId)}/records/${encodeURIComponent(
            PROJECT_RECORD_KEY,
          )}/attachments/${encodeURIComponent(rel)}`,
          { headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} },
        );
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    },

    async readGeneratedBytes(publicPath) {
      return this.readGenerated(publicPath);
    },

    async generatedExists(publicPath) {
      return (await this.readGenerated(publicPath)) !== null;
    },

    resolveGeneratedAbsPath() {
      // Remote store: no local absolute path. Callers must use readGenerated().
      return null;
    },

    async ensureGeneratedDir() {
      // Remote store: no local directory. Media is persisted via writeGenerated().
      return null;
    },

    async verifyConnection() {
      try {
        await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}`);
        return { ok: true, base_url: baseUrl, base_id: baseId };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },

    configSummary() {
      return {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        media_serving: "busabase-proxy",
      };
    },
  };

  return provider;
}
