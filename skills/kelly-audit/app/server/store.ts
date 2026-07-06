// Compatibility shim over the data-provider layer.
//
// The real storage surface now lives in lib/data-provider/* (local-file default
// or Busabase) behind the DataProvider interface, and the provider-agnostic
// helpers (JSON read/write, emptySnapshot, mergeAnomalies, config/env loading)
// live in lib/audit-core.ts. This module keeps the historical `./store.ts`
// import surface — used by the scripts — by re-exporting the pure helpers and
// wrapping the current provider's read/write methods as free functions.
//
// A single lazily-created provider (selected by KELLY_AUDIT_DATA_PROVIDER /
// config.data_provider) backs every call here, so `node scripts/*.ts` runs
// against the same backend the server does.

import { createProvider } from "../../lib/data-provider/index.ts";
import type { DataProvider } from "../../lib/data-provider/provider-interface.ts";
import type {
  AgentTasksFile,
  ApplyDecisionInput,
  ApplyDecisionResult,
  AuditSnapshot,
  DecisionsFile,
  ExecutionReport,
  LockRecord,
  Onboarding,
} from "../../lib/types.ts";

// Provider-agnostic helpers keep their original names/signatures.
export {
  configSearchPaths,
  emptySnapshot,
  envSearchPaths,
  loadDotenvFiles,
  mergeAnomalies,
  readConfig,
  readJson,
  summarizeConfig,
  writeJson,
} from "../../lib/audit-core.ts";

let providerPromise: Promise<DataProvider> | null = null;
function provider(): Promise<DataProvider> {
  providerPromise ??= createProvider();
  return providerPromise;
}

export async function ensureDirs(): Promise<void> {
  await (await provider()).ensureReady();
}

export async function readSnapshot(): Promise<AuditSnapshot> {
  return (await provider()).readSnapshot();
}

export async function readOnboarding(): Promise<Onboarding> {
  return (await provider()).readOnboarding();
}

export async function readLock(): Promise<LockRecord | null> {
  return (await provider()).readLock();
}

export async function readDecisions(): Promise<DecisionsFile> {
  return (await provider()).readDecisions();
}

export async function readAgentTasks(): Promise<AgentTasksFile> {
  return (await provider()).readAgentTasks();
}

export async function readExecutionReport(): Promise<ExecutionReport | null> {
  return (await provider()).readExecutionReport();
}

export async function applyDecision(input: ApplyDecisionInput): Promise<ApplyDecisionResult> {
  return (await provider()).applyDecision(input);
}
