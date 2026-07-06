// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// kelly-money is a read-mostly ledger dashboard, so this provider maps a
// Busabase base onto the same store surface the local-file provider serves: the
// ledger snapshot lives as a record's commit `fields`, config and onboarding are
// read the same way, and there is no review queue to model. The UI is identical
// to local mode because getState() returns the same MoneyState shape.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_MONEY_BUSABASE_URL      e.g. http://127.0.0.1:3000
//   base_id       KELLY_MONEY_BUSABASE_BASE_ID  the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type { ConfigResult, ConfigSummary, LedgerSnapshot, MoneyState, ProviderMeta } from "../types.ts";
import { emptySnapshot } from "./local-file-provider.ts";

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = (meta.config?.busabase as Record<string, string> | undefined) || {};
  const baseUrl = (process.env.KELLY_MONEY_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_MONEY_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_MONEY_BUSABASE_API_KEY || ""
    : process.env.KELLY_MONEY_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_MONEY_BUSABASE_URL / KELLY_MONEY_BUSABASE_BASE_ID.",
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

  // The ledger snapshot is stored as a single record's committed fields.
  // Busabase returns records under a base; we take the first snapshot-shaped one.
  function recordToSnapshot(record: unknown): LedgerSnapshot | null {
    const rec = record as Record<string, unknown> | null;
    const fields = (rec?.fields || rec?.headCommit || rec) as Record<string, unknown> | undefined;
    const snap = (fields?.snapshot || fields) as LedgerSnapshot | undefined;
    if (snap && Array.isArray(snap.accounts) && Array.isArray(snap.transactions) && snap.metrics) return snap;
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

    async readSnapshot(): Promise<LedgerSnapshot> {
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

    async writeSnapshot(snapshot: LedgerSnapshot): Promise<{ ok: boolean; path?: string | null }> {
      const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
        payload: {
          fields: { snapshot },
          message: `Ledger snapshot ${snapshot.generated_at}`,
          submittedBy: "kelly-money",
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
      const config = meta.config || { accounts: [] };
      return { config, path: meta.source || "", is_example: Boolean(meta.is_example) };
    },

    summarizeConfig(configResult: ConfigResult): ConfigSummary {
      const accounts = Array.isArray(configResult.config.accounts) ? configResult.config.accounts : [];
      return {
        config_path: configResult.path,
        is_example: configResult.is_example,
        accounts: accounts.map((account) => {
          const secretKeys = ["api_key_env", "client_id_env", "client_secret_env", "token_env"].filter(
            (key) => account[key],
          );
          return {
            account_id: account.account_id || "",
            provider: account.provider || "",
            display_name: account.display_name || account.account_id || "",
            entity: account.entity || "",
            currency: account.currency || "",
            secret_envs: secretKeys.map((key) => account[key] as string),
            secrets_ready: secretKeys.every((key) => Boolean(process.env[account[key] as string])),
          };
        }),
      };
    },

    async getState(): Promise<MoneyState> {
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
