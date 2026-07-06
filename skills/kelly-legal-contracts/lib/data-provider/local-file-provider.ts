// Local-file DataProvider: the zero-dependency default.
//
// This is the store.ts fs logic, relocated behind the provider seam. State
// lives in app/.data/*.json. The same review model is served remotely by the
// Busabase provider, so
// KELLY_LEGAL_CONTRACTS_DATA_PROVIDER=local|busabase is a config switch, not a UI or
// script rewrite.

import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  CLAIMS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type {
  ClaimPayload,
  ClaimRule,
  ClaimsRegistry,
  ConfigResult,
  DecisionPayload,
  HttpError,
  ProviderMeta,
} from "../types.ts";

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function emptySnapshot() {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-legal-contracts",
    seller: { brand: "", entity: "" },
    metrics: {
      product_count: 0,
      draft_count: 0,
      drafts_by_platform: {},
      drafts_needs_review: 0,
      drafts_approved: 0,
      drafts_in_revision: 0,
      checks_failed: 0,
      compliance_pass_rate: 0,
      exported_this_week: 0,
    },
    products: [],
    drafts: [],
    rules: [],
    checks: [],
    review_items: [],
    activity_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No contract review snapshot exists yet. Ingest contract facts or ask the agent to draft contract issues from a legal intake.",
      },
    ],
  };
}

function emptyClaims(): ClaimsRegistry {
  return { updated_at: "", claims: [], rules: [] };
}

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

function slugify(value: string) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "claim"
  );
}

function summarizeConfig(configResult: ConfigResult, providerKind: string) {
  const config = configResult.config || {};
  const seller = (config.seller as Record<string, unknown>) || {};
  const exportPrefs = (config.export as Record<string, unknown>) || {};
  const publish = (config.publish as Record<string, unknown>) || {};
  const secretKeys = ["token_env", "api_key_env", "client_secret_env"].filter((key) => publish[key]);
  return {
    provider: providerKind,
    config_path: configResult.path,
    is_example: configResult.is_example,
    seller: {
      brand: seller.brand || "",
      entity: seller.entity || "",
      tone: seller.tone || "",
    },
    locales: Array.isArray(config.locales) ? config.locales : [],
    platforms: (Array.isArray(config.platforms) ? config.platforms : []).map((entry) => ({
      platform: entry.platform || "",
      enabled: entry.enabled !== false,
      locales: Array.isArray(entry.locales) ? entry.locales : [],
      rules: entry.rules || {},
    })),
    banned_words_count: Array.isArray(config.banned_words) ? config.banned_words.length : 0,
    competitor_brands_count: Array.isArray(config.competitor_brands) ? config.competitor_brands.length : 0,
    keyword_stuffing: { max_repeats: Number((config.keyword_stuffing as any)?.max_repeats) || 3 },
    export: {
      format: exportPrefs.format || "markdown+csv",
      out_dir: exportPrefs.out_dir || "exports",
    },
    publish: {
      handoff_to_agent: publish.handoff_to_agent ?? true,
      requires_approval: publish.requires_approval ?? true,
      secret_envs: secretKeys.map((key) => publish[key]),
      secrets_ready: secretKeys.every((key) => Boolean(process.env[String(publish[key])])),
    },
  };
}

function configSearchPaths() {
  const paths: string[] = [];
  if (process.env.KELLY_LEGAL_CONTRACTS_CONFIG) paths.push(process.env.KELLY_LEGAL_CONTRACTS_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-legal-contracts", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

export function createLocalFileProvider(meta: ProviderMeta = {}) {
  const provider = {
    kind: "local",

    async ensureDirs() {
      await fs.mkdir(DATA_DIR, { recursive: true });
    },

    async readSnapshot() {
      return readJson(SNAPSHOT_PATH, emptySnapshot());
    },

    async writeSnapshot(snapshot) {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },

    async readDecisions() {
      return readJson(DECISIONS_PATH, { updated_at: "", decisions: {} });
    },

    async readAgentTasks() {
      return readJson(AGENT_TASKS_PATH, { updated_at: "", tasks: [] });
    },

    async writeAgentTasks(tasks) {
      await writeJson(AGENT_TASKS_PATH, tasks);
    },

    async readExecutionReport() {
      return readJson(EXECUTION_REPORT_PATH, null);
    },

    async writeExecutionReport(report) {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    async readOnboarding() {
      return readJson(ONBOARDING_PATH, { completed: false });
    },

    async readLock() {
      return readJson(LOCK_PATH, null);
    },

    async readConfig(): Promise<ConfigResult> {
      for (const file of configSearchPaths()) {
        const config = await readJson(file, null);
        if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
      }
      return { config: {}, path: "", is_example: false };
    },

    // ── claims / compliance registry ─────────────────────────────────────────
    async readClaims(): Promise<ClaimsRegistry> {
      const registry = await readJson(CLAIMS_PATH, emptyClaims());
      return {
        updated_at: registry.updated_at || "",
        claims: Array.isArray(registry.claims) ? registry.claims : [],
        rules: Array.isArray(registry.rules) ? registry.rules : [],
      };
    },

    async writeClaims(registry: ClaimsRegistry) {
      await writeJson(CLAIMS_PATH, registry);
    },

    async saveClaim(payload: ClaimPayload) {
      if (await this.readLock()) {
        const error: HttpError = new Error("Contract review files are locked while the agent is writing.");
        error.statusCode = 423;
        throw error;
      }
      if (!payload || !payload.text) {
        const error: HttpError = new Error("missing claim text");
        error.statusCode = 400;
        throw error;
      }
      const registry = await this.readClaims();
      const now = new Date().toISOString();
      const claimId = payload.claim_id || `claim-${slugify(payload.text)}`;
      const existing = registry.claims.find((claim) => claim.claim_id === claimId);
      const status = payload.status || existing?.status || "pending";
      const claim = {
        claim_id: claimId,
        text: payload.text,
        status,
        category: payload.category ?? existing?.category ?? "",
        substantiation: payload.substantiation ?? existing?.substantiation ?? "",
        evidence: Array.isArray(payload.evidence) ? payload.evidence : existing?.evidence || [],
        approved_by: payload.approved_by ?? existing?.approved_by ?? "",
        approved_at: status === "approved" ? payload.approved_at || existing?.approved_at || now : "",
        notes: payload.notes ?? existing?.notes ?? "",
        created_at: existing?.created_at || now,
        updated_at: now,
      };
      if (existing) Object.assign(existing, claim);
      else registry.claims.push(claim);
      registry.updated_at = now;
      await this.writeClaims(registry);
      return { ok: true, claim };
    },

    async saveClaimRule(payload: Partial<ClaimRule>) {
      if (await this.readLock()) {
        const error: HttpError = new Error("Contract review files are locked while the agent is writing.");
        error.statusCode = 423;
        throw error;
      }
      if (!payload || !payload.phrase) {
        const error: HttpError = new Error("missing rule phrase");
        error.statusCode = 400;
        throw error;
      }
      const registry = await this.readClaims();
      const now = new Date().toISOString();
      const ruleType = payload.type === "restricted_phrase" ? "restricted_phrase" : "banned_word";
      const ruleId = payload.rule_id || `claimrule-${slugify(payload.phrase)}`;
      const existing = registry.rules.find((rule) => rule.rule_id === ruleId);
      const rule: ClaimRule = {
        rule_id: ruleId,
        phrase: payload.phrase,
        type: ruleType,
        severity: payload.severity || existing?.severity || "error",
        reason: payload.reason ?? existing?.reason ?? "",
        alternative: payload.alternative ?? existing?.alternative ?? "",
        created_at: existing?.created_at || now,
      };
      if (existing) Object.assign(existing, rule);
      else registry.rules.push(rule);
      registry.updated_at = now;
      await this.writeClaims(registry);
      return { ok: true, rule };
    },

    async applyDecision(payload: DecisionPayload = {}) {
      const action = String(payload.action || "");
      if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const snapshot = await this.readSnapshot();
      let reviewId = String(payload.review_id || "");
      if (!reviewId && payload.draft_id) {
        const item = (snapshot.review_items || []).find((entry) => entry.draft_id === payload.draft_id);
        if (!item) throw new Error(`No review item for draft: ${payload.draft_id}`);
        reviewId = item.review_id;
      }
      if (!reviewId) throw new Error("review_id is required");
      const item = (snapshot.review_items || []).find((entry) => entry.review_id === reviewId);
      if (!item) throw new Error(`Unknown review item: ${reviewId}`);
      const now = new Date().toISOString();
      const decisions = await this.readDecisions();
      decisions.decisions[reviewId] = {
        action,
        comment: String(payload.comment || ""),
        fields: payload.fields && typeof payload.fields === "object" ? payload.fields : undefined,
        decided_at: now,
      };
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);
      const tasks = await this.readAgentTasks();
      tasks.tasks = (tasks.tasks || []).filter((task) => task.review_id !== reviewId);
      if (action === "request_changes") {
        tasks.tasks.push({
          task_id: `task-${reviewId}-${Date.now()}`,
          type: "revise_contract_issue",
          review_id: reviewId,
          draft_id: item.draft_id,
          ref: item.ref,
          comment: String(payload.comment || ""),
          requested_at: now,
          status: "queued",
        });
      }
      tasks.updated_at = now;
      await writeJson(AGENT_TASKS_PATH, tasks);
      return decisions;
    },

    async getState() {
      const [snapshot, decisions, agentTasks, executionReport, onboarding, lock, configResult, claims] =
        await Promise.all([
          this.readSnapshot(),
          this.readDecisions(),
          this.readAgentTasks(),
          this.readExecutionReport(),
          this.readOnboarding(),
          this.readLock(),
          this.readConfig(),
          this.readClaims(),
        ]);
      return {
        app: "kelly-legal-contracts",
        data_provider: this.kind,
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult, this.kind),
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
        claims,
        snapshot,
      };
    },
  };
  void meta;
  return provider;
}
