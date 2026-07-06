// Back-compat shim over the data-provider layer.
//
// State access (snapshot, decisions, onboarding, agent tasks, lock, and the
// applyDecision review write-path) now lives in ../../lib/data-provider/*; the
// server and scripts obtain a provider from createProvider() and call its
// methods. This module re-exports the backend-agnostic helpers (config loading,
// dotenv, snapshot math) from lib/common.ts and the ensureDirs convenience so
// existing imports keep working.

import fs from "node:fs/promises";
import { DATA_DIR } from "./paths.ts";

export {
  configSearchPaths,
  emptySnapshot,
  envSearchPaths,
  loadDotenvFiles,
  pushEvent,
  readConfig,
  readJson,
  recomputeMetrics,
  round2,
  summarizeConfig,
  writeJson,
} from "../../lib/common.ts";
export { createProvider } from "../../lib/data-provider/index.ts";

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
