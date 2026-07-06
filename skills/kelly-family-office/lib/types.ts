// Shared types for the kelly-family-office data-provider layer.
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
  AccountRef,
  AssetClass,
  AssetClassRollup,
  BuildSnapshotInput,
  Config,
  ConfigResult,
  ConfigSummary,
  ConsolidatedSnapshot,
  Entity,
  EntityRollup,
  EntityType,
  FxRates,
  Holding,
  HoldingInput,
  Insight,
  InstitutionRollup,
  Severity,
  TargetAllocation,
  Totals,
  Warning,
} from "../app/server/types.ts";

import type { Config, ConfigSummary, ConsolidatedSnapshot } from "../app/server/types.ts";

// Result of loadConfig() in lib/data-provider/index.ts; passed to providers.
export interface ProviderMeta {
  config?: Config;
  source?: string | null;
  is_example?: boolean;
}

// The read-mostly aggregate a provider assembles for GET /api/state. The Hono
// server adds `app` and `data_provider` around this and computes insights at
// read time, so the shape stays identical to the pre-provider payload.
export interface FamilyOfficeState {
  onboarding: Record<string, unknown>;
  lock: Record<string, unknown> | null;
  config_summary: ConfigSummary;
  snapshot: ConsolidatedSnapshot;
}

// Error carrying an HTTP status code, thrown by the providers and read by the
// Hono server. Matches the runtime shape `new Error(...)` + `.statusCode = n`.
export interface HttpError extends Error {
  statusCode?: number;
}
