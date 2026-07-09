import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_NAME = "kelly-restaurant-intel";
export const DISPLAY_NAME = "Kelly Restaurant Intel";
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = Number.parseInt(
  process.env.KELLY_RESTAURANT_INTEL_UI_PORT || process.env.PORT || "3000",
  10,
);

export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const skillDir = path.resolve(appDir, "..");
export const dataDir = path.join(appDir, ".data");
export const batchPath = path.join(dataDir, "current_batch.json");
export const decisionsPath = path.join(dataDir, "decisions.json");
export const agentTasksPath = path.join(dataDir, "agent_tasks.json");
export const executionReportPath = path.join(dataDir, "execution_report.json");
export const onboardingPath = path.join(dataDir, "onboarding.json");
export const lockPath = path.join(dataDir, "agent.lock");
export const configExamplePath = path.join(skillDir, "config.example.json");
export const configLocalPath = path.join(skillDir, "config.local.json");
