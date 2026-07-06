// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// kelly-money is a read-mostly dashboard, so this is a mapping layer, not a
// backend: it reads the ledger snapshot out of a Busabase base's records and
// reshapes them into the SAME LedgerSnapshot the local provider serves, so the
// UI renders identically whether KELLY_MONEY_DATA_PROVIDER=local or busabase.
//
// Busabase stores each snapshot section as records in typed tables. This client
// pulls those records and reassembles accounts / transactions / invoices /
// invoice_matches; onboarding + config live in a small meta table. Writes are
// out of scope — the read-only sync scripts populate the base upstream.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_MONEY_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_MONEY_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type {
  Account,
  AppState,
  ConfigSummary,
  Invoice,
  InvoiceMatch,
  LedgerSnapshot,
  Onboarding,
  ProviderMeta,
  SnapshotMetrics,
  Transaction,
  Warning,
} from "../types.ts";

interface BusabaseRecord {
  id?: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_MONEY_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_MONEY_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_MONEY_BUSABASE_API_KEY || ""
    : process.env.KELLY_MONEY_BUSABASE_API_KEY || "";

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_MONEY_BUSABASE_URL / KELLY_MONEY_BUSABASE_BASE_ID.",
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

  // A Busabase table listing may be an array or { items: [] }; each entry may be
  // a { fields } wrapper or a flat record. Normalize to plain field objects,
  // typed as the caller's row shape (rows are validated upstream by the sync).
  async function records<T = Record<string, unknown>>(table: string): Promise<T[]> {
    const raw = (await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}/tables/${table}/records`)) as
      | BusabaseRecord[]
      | { items?: BusabaseRecord[] }
      | null;
    const list = Array.isArray(raw) ? raw : raw?.items || [];
    return list.map((entry) =>
      entry && typeof entry.fields === "object" ? entry.fields || {} : entry || {},
    ) as unknown as T[];
  }

  function summary(): ConfigSummary {
    return {
      config_path: `${baseUrl} (base ${baseId})`,
      is_example: false,
      accounts: [],
      provider: "busabase",
      base_url: baseUrl || null,
      base_id: baseId || null,
      api_key: apiKey ? "configured" : "none",
    };
  }

  function computeMetrics(accounts: Account[], transactions: Transaction[]): SnapshotMetrics {
    return accounts.reduce(
      (acc, item) => {
        acc.gross_inflow += item.totals?.gross_inflow || 0;
        acc.gross_outflow += item.totals?.gross_outflow || 0;
        acc.fees += item.totals?.fees || 0;
        acc.net += item.totals?.net || 0;
        return acc;
      },
      {
        account_count: accounts.length,
        transaction_count: transactions.length,
        gross_inflow: 0,
        gross_outflow: 0,
        fees: 0,
        net: 0,
      },
    );
  }

  const provider = {
    kind: "busabase",

    async getConfigSummary(): Promise<ConfigSummary> {
      return summary();
    },

    async getOnboarding(): Promise<Onboarding> {
      try {
        const meta = await records("meta");
        const onboarding = meta.find((row) => row.key === "onboarding");
        if (onboarding && typeof onboarding.value === "object" && onboarding.value) {
          return onboarding.value as Onboarding;
        }
      } catch {
        // meta table optional — fall through to a sane default
      }
      return { completed: false };
    },

    async getLock(): Promise<unknown> {
      // Busabase is authoritative and never mid-write from this reader's view.
      return null;
    },

    async getSnapshot(): Promise<LedgerSnapshot> {
      const [accounts, transactions, invoices, invoice_matches, warnings] = await Promise.all([
        records<Account>("accounts"),
        records<Transaction>("transactions"),
        records<Invoice>("invoices").catch(() => [] as Invoice[]),
        records<InvoiceMatch>("invoice_matches").catch(() => [] as InvoiceMatch[]),
        records<Warning>("warnings").catch(() => [] as Warning[]),
      ]);
      return {
        schema_version: "1",
        generated_at: new Date().toISOString(),
        source: `busabase-${baseId}`,
        base_currency: "USD",
        range: { start: "", end: "" },
        metrics: computeMetrics(accounts, transactions),
        accounts,
        transactions,
        invoices,
        invoice_matches,
        warnings,
      };
    },

    async getState(): Promise<AppState> {
      const config_summary = summary();
      try {
        const [snapshot, onboarding, lock] = await Promise.all([
          this.getSnapshot(),
          this.getOnboarding(),
          this.getLock(),
        ]);
        return {
          app: "kelly-money",
          data_provider: "busabase",
          onboarding,
          lock,
          config_summary,
          snapshot,
        };
      } catch (error) {
        // A dashboard should degrade to an empty-but-valid snapshot with the
        // error surfaced in the summary, not 500 the whole page.
        return {
          app: "kelly-money",
          data_provider: "busabase",
          onboarding: { completed: false },
          lock: null,
          config_summary: { ...config_summary, error: (error as Error).message },
          snapshot: {
            schema_version: "1",
            generated_at: new Date().toISOString(),
            source: `busabase-${baseId}`,
            base_currency: "USD",
            range: { start: "", end: "" },
            metrics: {
              account_count: 0,
              transaction_count: 0,
              gross_inflow: 0,
              gross_outflow: 0,
              fees: 0,
              net: 0,
            },
            accounts: [],
            transactions: [],
            invoices: [],
            invoice_matches: [],
            warnings: [
              {
                id: "busabase-unreachable",
                severity: "warning",
                message: "Could not reach Busabase; showing an empty snapshot.",
                detail: (error as Error).message,
              },
            ],
          },
        };
      }
    },

    async verifyConnection(): Promise<Record<string, unknown>> {
      requireConfig();
      await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}`);
      return { ok: true, base_url: baseUrl, base_id: baseId };
    },
  };

  return provider;
}
