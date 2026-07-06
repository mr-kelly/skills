// Shared types for the kelly-money data-provider layer.
//
// The domain shapes (ledger snapshot, accounts, transactions, invoices, config,
// ...) already live in app/server/types.ts and are re-exported here so the
// provider layer and the scripts import them from one place. This file adds only
// the provider-layer types: the loaded-config meta, the aggregate /api/state
// payload, and the HTTP-status-carrying error the Hono server understands.
//
// Erasable-only TypeScript (native Node type-stripping): types/interfaces and
// union string literals only — no enums, namespaces, or runtime constructs.

export type {
  Account,
  AccountBalance,
  AccountTotals,
  AuditEvent,
  Config,
  ConfigAccount,
  ConfigResult,
  Direction,
  DemoQuery,
  Invoice,
  InvoiceDirection,
  InvoiceMatch,
  LedgerSnapshot,
  Onboarding,
  Severity,
  SnapshotMetrics,
  Transaction,
  Warning,
} from "../app/server/types.ts";

import type { Config, LedgerSnapshot } from "../app/server/types.ts";

// Result of loadConfig() in lib/data-provider/index.ts; passed to providers.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// Sanitized per-account summary echoed in /api/state (never secrets).
export interface ConfigSummaryAccount {
  account_id: string;
  provider: string;
  display_name: string;
  entity: string;
  currency: string;
  secret_envs: string[];
  secrets_ready: boolean;
}

// The sanitized config summary the UI consumes (never secrets).
export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  accounts: ConfigSummaryAccount[];
}

// The read-mostly aggregate a provider assembles for GET /api/state. The Hono
// server adds `app` and `data_provider` around this, so the shape stays
// identical to the pre-provider payload.
export interface MoneyState {
  onboarding: Record<string, unknown>;
  lock: Record<string, unknown> | null;
  config_summary: ConfigSummary;
  snapshot: LedgerSnapshot;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
