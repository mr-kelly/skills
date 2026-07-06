// Busabase FundProvider: a thin HTTP client to a Busabase base.
//
// kelly-family-fund is a read-mostly dashboard, so the mapping is simple: the
// fund snapshot is a single record's committed `fields`, the onboarding marker
// and the write lock are two more records. Reads project those records back into
// the same FundState the local provider returns, so the UI renders identically
// in either mode. Persisting a snapshot (CSV import / demo generation) commits
// new fields onto the snapshot record.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_FAMILY_FUND_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_FAMILY_FUND_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`. Reads degrade gracefully: if the base is
// unreachable, getState() returns an empty snapshot with an error in the summary
// rather than crashing the dashboard.

import type { Config, ConfigResult, ConfigSummary, FundProvider, FundSnapshot, ProviderMeta } from "../types.ts";
import { emptySnapshot, summarizeConfig } from "./local-file-provider.ts";
import type { FundState } from "./provider-interface.ts";

// Logical record ids inside the target base. A snapshot lives under one record;
// onboarding and lock are singleton markers.
const SNAPSHOT_RECORD = "fund-snapshot";
const ONBOARDING_RECORD = "fund-onboarding";
const LOCK_RECORD = "fund-lock";

export function createBusabaseProvider(meta: ProviderMeta = {}): FundProvider {
  const config = (meta.config as Config) || {};
  const busa = config.busabase || {};
  const baseUrl = (process.env.KELLY_FAMILY_FUND_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_FAMILY_FUND_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_FAMILY_FUND_BUSABASE_API_KEY || ""
    : process.env.KELLY_FAMILY_FUND_BUSABASE_API_KEY || "";

  const configResult: ConfigResult = {
    config: (config as Config) || { beneficiaries: [], families: [] },
    path: meta.source || "",
    is_example: Boolean(meta.is_example),
  };

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_FAMILY_FUND_BUSABASE_URL / KELLY_FAMILY_FUND_BUSABASE_BASE_ID.",
      );
    }
  }

  async function api(method: string, pathname: string, body?: unknown): Promise<unknown> {
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

  function recordFields(record: unknown): Record<string, unknown> {
    const rec = (record || {}) as Record<string, unknown>;
    const head = (rec.headCommit || {}) as Record<string, unknown>;
    return (head.fields as Record<string, unknown>) || (rec.fields as Record<string, unknown>) || {};
  }

  async function fetchRecord(recordId: string): Promise<Record<string, unknown>> {
    const record = await api(
      "GET",
      `/api/v1/bases/${encodeURIComponent(baseId)}/records/${encodeURIComponent(recordId)}`,
    );
    return recordFields(record);
  }

  async function commitRecord(recordId: string, fields: Record<string, unknown>, message: string): Promise<void> {
    await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/records/${encodeURIComponent(recordId)}/commits`, {
      payload: { fields, message, author: "kelly-family-fund" },
    });
  }

  return {
    kind: "busabase",

    async getConfig() {
      return configResult;
    },

    async getConfigSummary() {
      return summarizeConfig(configResult);
    },

    async getSnapshot() {
      try {
        const fields = await fetchRecord(SNAPSHOT_RECORD);
        const snapshot = fields.snapshot as FundSnapshot | undefined;
        return snapshot && typeof snapshot === "object" ? snapshot : emptySnapshot();
      } catch {
        return emptySnapshot();
      }
    },

    async getOnboarding() {
      try {
        const fields = await fetchRecord(ONBOARDING_RECORD);
        return Object.keys(fields).length ? fields : { completed: false };
      } catch {
        return { completed: false };
      }
    },

    async getLock() {
      try {
        const fields = await fetchRecord(LOCK_RECORD);
        return Object.keys(fields).length ? fields : null;
      } catch {
        return null;
      }
    },

    async getState(): Promise<FundState> {
      const summary: ConfigSummary = summarizeConfig(configResult);
      const [snapshot, onboarding, lock] = await Promise.all([
        this.getSnapshot(),
        this.getOnboarding(),
        this.getLock(),
      ]);
      return {
        data_provider: this.kind,
        onboarding,
        lock,
        config_summary: summary,
        snapshot,
      };
    },

    async putSnapshot(snapshot: FundSnapshot) {
      await commitRecord(SNAPSHOT_RECORD, { snapshot }, `Snapshot ${snapshot.snapshot_id}`);
      return { ok: true, snapshot_id: snapshot.snapshot_id };
    },

    async verifyConnection() {
      requireConfig();
      await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}`);
      return { ok: true, base_url: baseUrl, base_id: baseId };
    },
  };
}
