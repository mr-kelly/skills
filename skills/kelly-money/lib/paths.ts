import path from "node:path";
import { fileURLToPath } from "node:url";

// Filesystem anchors for the data-provider layer. lib/ sits beside app/ under the
// skill root, so these resolve to the SAME app/.data/*.json files the original
// app/server/store.ts read — the provider seam is a refactor, not a relocation.
export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
export const DATA_DIR = path.join(APP_DIR, ".data");
export const LEDGER_PATH = path.join(DATA_DIR, "ledger_snapshot.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
export const SYNC_REPORT_PATH = path.join(DATA_DIR, "sync_report.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
