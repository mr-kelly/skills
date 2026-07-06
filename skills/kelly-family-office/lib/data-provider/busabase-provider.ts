// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// kelly-family-office is a read-mostly consolidation dashboard, so this provider
// maps a Busabase base onto the same store surface the local-file provider
// serves: the consolidated snapshot lives as a record's commit `fields`, config
// and onboarding are read the same way, and there is no review queue to model.
// The UI is identical to local mode because getState() returns the same
// FamilyOfficeState shape.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_FAMILY_OFFICE_BUSABASE_URL      e.g. http://127.0.0.1:3000
//   base_id       KELLY_FAMILY_OFFICE_BUSABASE_BASE_ID  the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type { ConfigResult, ConfigSummary, ConsolidatedSnapshot, FamilyOfficeState, ProviderMeta } from "../types.ts";
import { emptySnapshot } from "./local-file-provider.ts";

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = (meta.config?.busabase as Record<string, string> | undefined) || {};
  const baseUrl = (process.env.KELLY_FAMILY_OFFICE_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_FAMILY_OFFICE_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_FAMILY_OFFICE_BUSABASE_API_KEY || ""
    : process.env.KELLY_FAMILY_OFFICE_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_FAMILY_OFFICE_BUSABASE_URL / KELLY_FAMILY_OFFICE_BUSABASE_BASE_ID.",
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

  // The consolidated snapshot is stored as a single record's committed fields.
  // Busabase returns records under a base; we take the first snapshot-shaped one.
  function recordToSnapshot(record: unknown): ConsolidatedSnapshot | null {
    const rec = record as Record<string, unknown> | null;
    const fields = (rec?.fields || rec?.headCommit || rec) as Record<string, unknown> | undefined;
    const snap = (fields?.snapshot || fields) as ConsolidatedSnapshot | undefined;
    if (snap && Array.isArray(snap.holdings) && snap.totals) return snap;
    return null;
  }

  const provider = {
    kind: "busabase",

    configSummary() {
      return {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
      };
    },

    async readSnapshot(): Promise<ConsolidatedSnapshot> {
      try {
        const records = await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}/records`);
        const list = Array.isArray(records) ? records : records?.items || [];
        for (const record of list) {
          const snapshot = recordToSnapshot(record);
          if (snapshot) return snapshot;
        }
        return emptySnapshot();
      } catch {
        return emptySnapshot();
      }
    },

    async writeSnapshot(snapshot: ConsolidatedSnapshot): Promise<{ ok: boolean; path?: string | null }> {
      const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
        payload: {
          fields: { snapshot },
          message: `Consolidated snapshot ${snapshot.snapshot_id}`,
          submittedBy: "kelly-family-office",
        },
      });
      return { ok: true, path: cr?.id ? `${baseUrl} (change-request ${cr.id})` : `${baseUrl} (base ${baseId})` };
    },

    async readOnboarding(): Promise<Record<string, unknown>> {
      // Onboarding is a local UX marker; a live Busabase base is already onboarded.
      return { completed: true, source: "busabase" };
    },

    async readLock(): Promise<Record<string, unknown> | null> {
      // Busabase serializes writes server-side; there is no local file lock.
      return null;
    },

    async readConfig(): Promise<ConfigResult> {
      const config = meta.config || { entities: [], institutions: [] };
      return { config, path: meta.source || "", is_example: Boolean(meta.is_example) };
    },

    summarizeConfig(configResult: ConfigResult): ConfigSummary {
      const config = configResult.config || {};
      const entities = Array.isArray(config.entities) ? config.entities : [];
      const institutions = Array.isArray(config.institutions) ? config.institutions : [];
      return {
        config_path: configResult.path,
        is_example: configResult.is_example,
        base_currency: config.base_currency || "USD",
        fx_rates: config.fx_rates || { USD: 1 },
        entities: entities.map((entity) => ({
          entity_id: entity.entity_id || "",
          name: entity.name || entity.entity_id || "",
          type: entity.type || "",
          member: entity.member || "",
        })),
        institutions,
      };
    },

    async getState(): Promise<FamilyOfficeState> {
      const [snapshot, onboarding, lock, configResult] = await Promise.all([
        this.readSnapshot(),
        this.readOnboarding(),
        this.readLock(),
        this.readConfig(),
      ]);
      return {
        onboarding,
        lock,
        config_summary: this.summarizeConfig(configResult),
        snapshot,
      };
    },

    async verifyConnection(): Promise<Record<string, unknown>> {
      try {
        await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}`);
        return { ok: true, base_url: baseUrl, base_id: baseId };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },
  };

  return provider;
}
