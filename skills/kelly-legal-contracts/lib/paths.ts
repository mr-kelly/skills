// Filesystem layout for the kelly-legal-contracts data-provider layer. lib/ sits beside
// app/, so the skill dir is one level up from here. The local provider writes
// the same app/.data/*.json handoff files the store used before this retrofit,
// so nothing about the on-disk contract changed — only where the code lives.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(LIB_DIR, "..");
export const APP_DIR = path.join(SKILL_DIR, "app");
// Handoff state is authoritative — app/.data, matching app/server/paths.ts.
export const DATA_DIR = path.join(APP_DIR, ".data");
export const CACHE_DIR = path.join(APP_DIR, ".cache");
export const SNAPSHOT_PATH = path.join(DATA_DIR, "contract_snapshot.json");
export const DECISIONS_PATH = path.join(DATA_DIR, "decisions.json");
export const AGENT_TASKS_PATH = path.join(DATA_DIR, "agent_tasks.json");
export const EXECUTION_REPORT_PATH = path.join(DATA_DIR, "execution_report.json");
export const ONBOARDING_PATH = path.join(DATA_DIR, "onboarding.json");
// Claims / compliance registry: approved marketing claims + banned-word and
// restricted-phrase rules the compliance engine consults.
export const CLAIMS_PATH = path.join(DATA_DIR, "claims.json");
export const LOCK_PATH = path.join(DATA_DIR, "agent.lock");
