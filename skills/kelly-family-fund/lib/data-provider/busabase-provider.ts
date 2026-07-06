// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// kelly-family-fund is a read-mostly pooled-pension ledger dashboard, so this
// provider maps a Busabase base onto the same store surface the local-file
// provider serves: the built snapshot lives as a record's commit `fields`,
// config and onboarding are read the same way, and there is no review queue to
// model. The UI is identical to local mode because getState() returns the same
// FamilyFundState shape.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_FAMILY_FUND_BUSABASE_URL      e.g. http://127.0.0.1:3000
//   base_id       KELLY_FAMILY_FUND_BUSABASE_BASE_ID  the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type { ConfigResult, ConfigSummary, FamilyFundState, FundSnapshot, ProviderMeta } from "../types.ts";
import { emptySnapshot } from "./local-file-provider.ts";

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = (meta.config?.busabase as Record<string, string> | undefined) || {};
  const baseUrl = (process.env.KELLY_FAMILY_FUND_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_FAMILY_FUND_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_FAMILY_FUND_BUSABASE_API_KEY || ""
    : process.env.KELLY_FAMILY_FUND_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_FAMILY_FUND_BUSABASE_URL / KELLY_FAMILY_FUND_BUSABASE_BASE_ID.",
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

  // The built snapshot is stored as a single record's committed fields. Busabase
  // returns records under a base; we take the first snapshot-shaped one.
  function recordToSnapshot(record: unknown): FundSnapshot | null {
    const rec = record as Record<string, unknown> | null;
    const fields = (rec?.fields || rec?.headCommit || rec) as Record<string, unknown> | undefined;
    const snap = (fields?.snapshot || fields) as FundSnapshot | undefined;
    if (snap && Array.isArray(snap.expenses) && Array.isArray(snap.income) && snap.totals) return snap;
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

    async readSnapshot(): Promise<FundSnapshot> {
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

    async writeSnapshot(snapshot: FundSnapshot): Promise<{ ok: boolean; path?: string | null }> {
      const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
        payload: {
          fields: { snapshot },
          message: `Fund snapshot ${snapshot.snapshot_id}`,
          submittedBy: "kelly-family-fund",
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
      const config = meta.config || { beneficiaries: [], families: [] };
      return { config, path: meta.source || "", is_example: Boolean(meta.is_example) };
    },

    summarizeConfig(configResult: ConfigResult): ConfigSummary {
      const config = configResult.config || {};
      const beneficiaries = Array.isArray(config.beneficiaries) ? config.beneficiaries : [];
      const families = Array.isArray(config.families) ? config.families : [];
      const fund = config.fund || {};
      return {
        config_path: configResult.path,
        is_example: configResult.is_example,
        base_currency: config.base_currency || "CNY",
        fund: {
          name: fund.name || "",
          steward: fund.steward || "",
          note: fund.note || "",
        },
        beneficiaries: beneficiaries.map((b) => ({
          id: b.id || "",
          name: b.name || b.id || "",
          relation: b.relation || "",
          pension_monthly: Number(b.pension_monthly) || 0,
        })),
        families: families.map((f) => ({
          id: f.id || "",
          name: f.name || f.id || "",
          head: f.head || "",
          members_count: Number(f.members_count) || 0,
        })),
        deviation_threshold_pct: Number(config.fairness?.deviation_threshold_pct) || 20,
      };
    },

    async getState(): Promise<FamilyFundState> {
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
