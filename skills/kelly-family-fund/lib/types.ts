// Shared types for the kelly-family-fund data-provider layer.
//
// The domain shapes (snapshot, entities, config, ...) already live in
// app/server/types.ts and are re-exported here so the provider layer and the
// scripts import them from one place. This file adds only the provider-layer
// types: the loaded-config meta, the aggregate /api/state payload, and the
// HTTP-status-carrying error the Hono server understands.
//
// Erasable-only TypeScript (native Node type-stripping): types/interfaces and
// union string literals only — no enums, namespaces, or runtime constructs.

export type {
  Beneficiary,
  BuildSnapshotInput,
  Category,
  CategoryRollup,
  Config,
  ConfigResult,
  ConfigSummary,
  Expense,
  ExpenseInput,
  FairnessConfig,
  Family,
  FamilyRollup,
  FundMeta,
  FundSnapshot,
  Income,
  IncomeInput,
  Insight,
  MonthRollup,
  Severity,
  Totals,
} from "../app/server/types.ts";

import type { Config, ConfigSummary, FundSnapshot } from "../app/server/types.ts";

// Result of loadConfig() in lib/data-provider/index.ts; passed to providers.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// The read-mostly aggregate a provider assembles for GET /api/state. The Hono
// server adds `app` and `data_provider` around this and computes insights at
// read time, so the shape stays identical to the pre-provider payload.
export interface FamilyFundState {
  onboarding: Record<string, unknown>;
  lock: Record<string, unknown> | null;
  config_summary: ConfigSummary;
  snapshot: FundSnapshot;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
