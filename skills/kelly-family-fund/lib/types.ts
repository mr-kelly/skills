// Types for the kelly-family-fund data-provider layer.
//
// The domain shapes (FundSnapshot, Config, ConfigSummary, ...) already live in
// app/server/types.ts and are shared by the pure rollup/insight modules and the
// scripts. We re-export them here so the provider files have a single import
// surface, and add the provider-layer-only types (ProviderMeta, HttpError).

export type {
  Beneficiary,
  BusabaseConfig,
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

import type { Config } from "../app/server/types.ts";

// The provider contract lives with its runtime guard in provider-interface.ts;
// re-export it here so the provider implementations have one import surface.
export type { FundProvider, FundState } from "./data-provider/provider-interface.ts";

// Result of loadConfig() in lib/data-provider/index.ts; passed to providers.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
