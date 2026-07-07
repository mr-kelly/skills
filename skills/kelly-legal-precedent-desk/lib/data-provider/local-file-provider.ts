import {
  emptyDecisions,
  enqueueAgentTask,
  readAgentTasks,
  readDecisions,
  readExecutionReport,
  readJson,
  readLock,
  readOnboarding,
  readSnapshot,
  statusFromDecision,
  writeAgentTasks,
  writeExecutionReport,
  writeJson,
  writeOnboarding,
  writeSnapshot,
} from "../common.ts";
import { DECISIONS_PATH, configSearchPaths } from "../paths.ts";
import { APP_ID, APP_TITLE, type ConfigResult, ENV_PREFIX } from "../types.ts";
import type { DataProvider, DecisionPayload } from "./provider-interface.ts";

const ALLOWED_ACTIONS = new Set(["approve", "request_changes", "revise", "block"]);

export function createLocalFileProvider(): DataProvider {
  return {
    kind: "local",

    async readConfig(): Promise<ConfigResult> {
      for (const file of configSearchPaths()) {
        const config = await readJson<Record<string, unknown>>(file, null);
        if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
      }
      return { config: {}, path: "", is_example: false };
    },

    async getState() {
      const configResult = await this.readConfig();
      return {
        app: APP_ID,
        data_provider: this.kind,
        onboarding: await readOnboarding(),
        lock: await readLock(),
        config_summary: summarizeConfig(configResult),
        decisions: await readDecisions(),
        agent_tasks: await readAgentTasks(),
        execution_report: await readExecutionReport(),
        snapshot: await readSnapshot(),
      };
    },

    async applyDecision(payload: DecisionPayload = {}) {
      const lock = await readLock();
      if (lock) {
        const error = new Error("Agent lock is active; the review queue is read-only right now.") as Error & {
          statusCode?: number;
        };
        error.statusCode = 423;
        throw error;
      }
      const id = String(payload.id || "");
      const action = String(payload.action || "");
      if (!id) throw new Error("id is required");
      if (!ALLOWED_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const decisions = await readDecisions();
      const now = new Date().toISOString();
      decisions.decisions[id] = {
        action: action as never,
        comment: String(payload.comment || ""),
        draft: typeof payload.draft === "string" ? payload.draft : undefined,
        fields: payload.fields && typeof payload.fields === "object" ? payload.fields : undefined,
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);
      if (action === "request_changes") {
        await enqueueAgentTask({ type: "revise_review_item", item_id: id, note: String(payload.comment || "") });
      }
      return decisions;
    },

    readLock,
    readSnapshot,
    writeSnapshot,
    readDecisions,
    readAgentTasks,
    writeAgentTasks,
    readExecutionReport,
    writeExecutionReport,

    async completeOnboarding(marker: Record<string, unknown> = {}) {
      const completed = {
        completed: true,
        completed_at: new Date().toISOString(),
        config_version: "1",
        ...marker,
      };
      await writeOnboarding(completed);
      return completed;
    },
  };
}

function summarizeConfig(result: ConfigResult) {
  const config = result.config || {};
  const firm = (config.firm_profile as Record<string, unknown>) || {};
  const exportPrefs = (config.export as Record<string, unknown>) || {};
  const secretEnvNames = collectSecretEnvNames(config);
  return {
    app: APP_TITLE,
    provider: "local",
    config_path: result.path,
    is_example: result.is_example,
    firm_profile: {
      firm_name: firm.firm_name || "",
      branch: firm.branch || "",
      reviewer_role: firm.reviewer_role || "",
      default_jurisdictions: Array.isArray(firm.default_jurisdictions) ? firm.default_jurisdictions : [],
    },
    export: {
      format: exportPrefs.format || "markdown+json",
      out_dir: exportPrefs.out_dir || "exports",
    },
    secret_envs: secretEnvNames.map((name) => ({ name, configured: Boolean(process.env[name]) })),
    data_provider_env: `${ENV_PREFIX}_DATA_PROVIDER`,
  };
}

function collectSecretEnvNames(value: unknown): string[] {
  const out = new Set<string>();
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (key.endsWith("_env") && typeof child === "string") out.add(child);
      else walk(child);
    }
  }
  walk(value);
  return [...out];
}
