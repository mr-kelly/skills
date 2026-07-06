// Busabase DataProvider: a thin, read-mostly HTTP client to a Busabase base.
//
// kelly-social is a monitoring dashboard, so this provider READS a Busabase base
// and projects its records onto the same normalized SocialSnapshot the UI
// consumes in local mode. There is no per-item review write to map; the agent
// still collects snapshots out of band and can publish them to Busabase.
//
// Config (config.busabase, env overrides win):
//   base_url   KELLY_SOCIAL_BUSABASE_URL      e.g. http://127.0.0.1:3000
//   base_id    KELLY_SOCIAL_BUSABASE_BASE_ID  the target Busabase base
//   api_key    KELLY_SOCIAL_BUSABASE_API_KEY  (or api_key_env -> that env var)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type {
  ConfigSummary,
  Lock,
  Onboarding,
  ProviderMeta,
  PublishingOperation,
  SocialSnapshot,
  SocialState,
} from "../types.ts";
import { emptySnapshot } from "./local-file-provider.ts";
import { applyPublishingOperation } from "./publishing-ops.ts";

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const config = meta.config || {};
  const busa = config.busabase || {};
  const baseUrl = (process.env.KELLY_SOCIAL_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_SOCIAL_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_SOCIAL_BUSABASE_API_KEY || ""
    : process.env.KELLY_SOCIAL_BUSABASE_API_KEY || "";
  const configPath = meta.source || "";
  const isExample = Boolean(meta.is_example);

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_SOCIAL_BUSABASE_URL / KELLY_SOCIAL_BUSABASE_BASE_ID.",
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

  // Project the Busabase base's snapshot record onto the normalized snapshot the
  // UI expects. A base stores the collected snapshot as a single record whose
  // commit `fields` mirror social_snapshot.json; if that ever splits into
  // per-account records this is the one place to remap.
  function recordsToSnapshot(payload: unknown): SocialSnapshot {
    const base = emptySnapshot();
    if (!payload || typeof payload !== "object") return base;
    const source = payload as Record<string, unknown>;
    const fields =
      (source.fields as Record<string, unknown> | undefined) ||
      (source.snapshot as Record<string, unknown> | undefined) ||
      source;
    return {
      ...base,
      ...fields,
      source: `busabase-${baseId}`,
      accounts: Array.isArray(fields.accounts) ? (fields.accounts as SocialSnapshot["accounts"]) : [],
      posts: Array.isArray(fields.posts) ? (fields.posts as SocialSnapshot["posts"]) : [],
      sync_log: Array.isArray(fields.sync_log) ? (fields.sync_log as SocialSnapshot["sync_log"]) : [],
      warnings: Array.isArray(fields.warnings) ? (fields.warnings as SocialSnapshot["warnings"]) : [],
      // ECHO publishing side — fall back to the empty seeds when the base omits them.
      calendar: Array.isArray(fields.calendar) ? (fields.calendar as SocialSnapshot["calendar"]) : base.calendar,
      drafts: Array.isArray(fields.drafts) ? (fields.drafts as SocialSnapshot["drafts"]) : base.drafts,
      shorts: Array.isArray(fields.shorts) ? (fields.shorts as SocialSnapshot["shorts"]) : base.shorts,
      engagement: Array.isArray(fields.engagement)
        ? (fields.engagement as SocialSnapshot["engagement"])
        : base.engagement,
      crisis: (fields.crisis as SocialSnapshot["crisis"]) || base.crisis,
      share_of_voice: (fields.share_of_voice as SocialSnapshot["share_of_voice"]) || base.share_of_voice,
    } as SocialSnapshot;
  }

  return {
    kind: "busabase",

    getConfigSummary(): ConfigSummary {
      return {
        provider: "busabase",
        config_path: configPath,
        is_example: isExample,
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        accounts: [],
      };
    },

    async getSnapshot(): Promise<SocialSnapshot> {
      try {
        const record = await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}/snapshot`);
        return recordsToSnapshot(record);
      } catch {
        return emptySnapshot();
      }
    },

    // Apply one ECHO publishing-desk operation. The single-tenant base exposes a
    // POST endpoint that persists the updated snapshot server-side; if the base
    // has no such route we read, apply the same pure reducer, and PUT the result
    // — either way the reducer is the source of truth for the state transition.
    async applyOperation(op: PublishingOperation): Promise<SocialSnapshot> {
      try {
        const record = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/operation`, op);
        return recordsToSnapshot(record);
      } catch {
        const current = await this.getSnapshot();
        const next = applyPublishingOperation(current, op);
        await api("PUT", `/api/v1/bases/${encodeURIComponent(baseId)}/snapshot`, { fields: next }).catch(() => null);
        return next;
      }
    },

    async getOnboarding(): Promise<Onboarding> {
      return { completed: Boolean(baseUrl && baseId), config_version: "busabase" };
    },

    async getLock(): Promise<Lock | null> {
      // Busabase serializes writes server-side; there is no client-held lock.
      return null;
    },

    async verifyConnection(): Promise<Record<string, unknown>> {
      try {
        await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}`);
        return { ok: true, base_url: baseUrl, base_id: baseId };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },

    async getState(): Promise<SocialState> {
      const summary = this.getConfigSummary();
      let snapshot: SocialSnapshot;
      try {
        const record = await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}/snapshot`);
        snapshot = recordsToSnapshot(record);
      } catch (error) {
        snapshot = emptySnapshot();
        summary.error = (error as Error).message;
      }
      return {
        data_provider: "busabase",
        onboarding: await this.getOnboarding(),
        lock: null,
        config_summary: summary,
        snapshot,
      };
    },
  };
}
