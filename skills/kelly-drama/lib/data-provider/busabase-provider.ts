// Busabase DramaProvider: a thin HTTP client to a Busabase base.
//
// Busabase (#4437) exposes a base as records over REST, so this is a mapping
// layer, not a backend. kelly-drama is a workspace app (one project document +
// config blobs + generated media), so the mapping is document-shaped rather than
// review-queue-shaped:
//
//   project document   -> a single record whose commit `fields` hold the whole
//                          project JSON (characters/episodes/shots/... ) under a
//                          well-known key; loadProject reads it, saveProject
//                          commits a new revision.
//   active pointer      -> a record holding { active_project_id }.
//   config blobs        -> one record per blob name (image/video/tts).
//   generated media     -> Busabase attachments addressed by the /generated/...
//                          public path.
//   write lock          -> a base-level lock record; absent => unlocked.
//
// Config (config.busabase, env overrides win):
//   base_url   KELLY_DRAMA_BUSABASE_URL      e.g. http://127.0.0.1:3000
//   base_id    KELLY_DRAMA_BUSABASE_BASE_ID  the target Busabase base
//   api_key_env -> reads that env var as a Bearer token (cloud/multi-tenant);
//                  the open-source single-tenant base needs no token.
//
// This provider preserves the SAME DramaProvider interface, so the server and
// scripts are byte-for-byte identical regardless of backend. The endpoint shapes
// below follow Busabase's record/commit REST surface; adjust the pathnames to a
// specific Busabase build if they drift.

import type { ActiveProjectState, ConfigBlob, HttpError, LockState, Project, ProviderMeta } from "../types.ts";
import { normalizeProject } from "./local-file-provider.ts";
import type { ConfigName } from "./provider-interface.ts";

// Well-known record keys inside the target Busabase base.
const PROJECT_RECORD = "kelly-drama:project";
const ACTIVE_RECORD = "kelly-drama:active-project";
const LOCK_RECORD = "kelly-drama:lock";
const CONFIG_RECORD: Record<ConfigName, string> = {
  image: "kelly-drama:config:image",
  video: "kelly-drama:config:video",
  tts: "kelly-drama:config:tts",
};

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_DRAMA_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_DRAMA_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_DRAMA_BUSABASE_API_KEY || ""
    : process.env.KELLY_DRAMA_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_DRAMA_BUSABASE_URL / KELLY_DRAMA_BUSABASE_BASE_ID.",
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
    if (res.status === 404) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // Read a record's commit fields (or null when the record does not exist).
  async function readRecord(recordKey: string): Promise<Record<string, unknown> | null> {
    const rec = await api(
      "GET",
      `/api/v1/bases/${encodeURIComponent(baseId)}/records/${encodeURIComponent(recordKey)}`,
    );
    if (!rec) return null;
    return rec.fields || rec.headCommit?.fields || rec;
  }

  // Upsert a record's fields via a new commit.
  async function writeRecord(recordKey: string, fields: Record<string, unknown>) {
    await api("PUT", `/api/v1/bases/${encodeURIComponent(baseId)}/records/${encodeURIComponent(recordKey)}`, {
      payload: { fields, message: `kelly-drama update ${recordKey}`, author: "kelly-drama" },
    });
  }

  async function loadProject(): Promise<Project> {
    const fields = await readRecord(PROJECT_RECORD);
    return normalizeProject(fields?.project || fields || {});
  }

  return {
    kind: "busabase",

    async ensureProject() {
      const existing = await readRecord(PROJECT_RECORD);
      if (existing) return;
      await writeRecord(PROJECT_RECORD, { project: normalizeProject({}) });
    },

    loadProject,

    async saveProject(project: unknown): Promise<Project> {
      const normalized = normalizeProject(project);
      normalized.updated_at = new Date().toISOString();
      await writeRecord(PROJECT_RECORD, { project: normalized });
      return normalized;
    },

    async loadActiveProject(): Promise<ActiveProjectState> {
      const fields = await readRecord(ACTIVE_RECORD);
      return (fields as ActiveProjectState) || {};
    },

    async saveActiveProject(state: ActiveProjectState): Promise<ActiveProjectState> {
      await writeRecord(ACTIVE_RECORD, { ...state });
      return state;
    },

    async loadConfigBlob(name: ConfigName): Promise<ConfigBlob> {
      const recordKey = CONFIG_RECORD[name];
      if (!recordKey) throw new Error(`Unknown config blob: ${name}`);
      return (await readRecord(recordKey)) || {};
    },

    async saveConfigBlob(name: ConfigName, value: ConfigBlob): Promise<ConfigBlob> {
      const recordKey = CONFIG_RECORD[name];
      if (!recordKey) throw new Error(`Unknown config blob: ${name}`);
      await writeRecord(recordKey, { ...value });
      return value;
    },

    async getLock(): Promise<LockState> {
      const fields = await readRecord(LOCK_RECORD);
      if (!fields || !fields.locked) return { locked: false };
      return { locked: true, ...fields };
    },

    async assertUnlocked() {
      const lock = await this.getLock();
      if (lock.locked) {
        const error: HttpError = new Error("Project files are locked by the agent.");
        error.statusCode = 423;
        throw error;
      }
    },

    async readGeneratedAsset(publicPath: string): Promise<Buffer> {
      requireConfig();
      const res = await fetch(
        `${baseUrl}/api/v1/bases/${encodeURIComponent(baseId)}/attachments?path=${encodeURIComponent(publicPath)}`,
        { headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} },
      );
      if (!res.ok) throw new Error(`busabase attachment GET ${publicPath} -> ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },

    async writeGeneratedAsset(publicPath: string, bytes: Buffer) {
      requireConfig();
      const res = await fetch(
        `${baseUrl}/api/v1/bases/${encodeURIComponent(baseId)}/attachments?path=${encodeURIComponent(publicPath)}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: bytes as unknown as BodyInit,
        },
      );
      if (!res.ok) throw new Error(`busabase attachment PUT ${publicPath} -> ${res.status}`);
    },

    async generatedAssetExists(publicPath: string) {
      requireConfig();
      const res = await fetch(
        `${baseUrl}/api/v1/bases/${encodeURIComponent(baseId)}/attachments?path=${encodeURIComponent(publicPath)}`,
        { method: "HEAD", headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} },
      );
      return res.ok;
    },

    configSummary() {
      return {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
      };
    },
  };
}
