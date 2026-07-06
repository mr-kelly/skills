// Local-file LessonProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON handoff files. This is the offline
// reference implementation of the same review model Busabase serves remotely,
// so KELLY_LESSON_DATA_PROVIDER=local|busabase is a config switch, not a rewrite
// of the UI or scripts. The logic here is moved verbatim from the old
// app/server/store.ts so /api/state stays byte-identical.

import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type {
  AgentTasksFile,
  Config,
  ConfigResult,
  ConfigSummary,
  DecisionBody,
  DecisionsFile,
  ExecutionReport,
  HttpError,
  LessonSnapshot,
  LessonState,
  Lock,
  Onboarding,
  ProviderMeta,
} from "../types.ts";

async function readJson<T = unknown>(file: string, fallback: T | null = null): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function emptySnapshot(): LessonSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-lesson",
    school: { name: "", kind: "", class_length_minutes: 45, term: "" },
    metrics: {
      teacher_count: 0,
      plan_count: 0,
      plans_approved: 0,
      plans_in_revision: 0,
      plans_needs_review: 0,
      checks_failed: 0,
      compliance_pass_rate: 0,
    },
    teachers: [],
    plans: [],
    rules: [],
    checks: [],
    review_items: [],
    activity_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No lesson snapshot exists yet. Ingest a lesson plan or ask the agent to draft one from your curriculum materials.",
      },
    ],
  };
}

function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_LESSON_CONFIG) paths.push(process.env.KELLY_LESSON_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-lesson", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

async function readConfigFile(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const school = config.school || {};
  const feedback = config.feedback || {};
  const exportPrefs = config.export || {};
  const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => feedback[key]);
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    school: {
      name: school.name || "",
      kind: school.kind || "",
      term: school.term || "",
      class_length_minutes: school.class_length_minutes ?? 45,
    },
    subjects: Array.isArray(config.subjects) ? config.subjects : [],
    grades: Array.isArray(config.grades) ? config.grades : [],
    template_sections: (Array.isArray(config.template_sections) ? config.template_sections : []).map((section) => ({
      key: section.key || "",
      label: section.label || section.key || "",
      required: Boolean(section.required),
    })),
    compliance_rules: (Array.isArray(config.compliance_rules) ? config.compliance_rules : []).map((rule) => ({
      rule_id: rule.rule_id || "",
      name: rule.name || rule.rule_id || "",
      severity: rule.severity || "warning",
      type: rule.type || "deterministic",
    })),
    export: {
      format: exportPrefs.format || "markdown",
      out_dir: exportPrefs.out_dir || "exports",
      docx_via_agent: exportPrefs.docx_via_agent ?? true,
    },
    feedback: {
      handoff_skill: feedback.handoff_skill || "",
      requires_approval: feedback.requires_approval ?? true,
      secret_envs: secretKeys.map((key) => String(feedback[key])),
      secrets_ready: secretKeys.every((key) => Boolean(process.env[String(feedback[key])])),
    },
  };
}

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

export function createLocalFileProvider(_meta: ProviderMeta = {}) {
  const provider = {
    kind: "local",

    async ensureDirs(): Promise<void> {
      await fs.mkdir(DATA_DIR, { recursive: true });
    },

    async readSnapshot(): Promise<LessonSnapshot> {
      return (await readJson<LessonSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as LessonSnapshot;
    },

    async readDecisions(): Promise<DecisionsFile> {
      return (await readJson<DecisionsFile>(DECISIONS_PATH, { updated_at: "", decisions: {} })) as DecisionsFile;
    },

    async readAgentTasks(): Promise<AgentTasksFile> {
      return (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { updated_at: "", tasks: [] })) as AgentTasksFile;
    },

    async readExecutionReport(): Promise<ExecutionReport | null> {
      return readJson<ExecutionReport>(EXECUTION_REPORT_PATH, null);
    },

    async readOnboarding(): Promise<Onboarding> {
      return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
    },

    async readLock(): Promise<Lock | null> {
      return readJson<Lock>(LOCK_PATH, null);
    },

    async readConfig(): Promise<ConfigResult> {
      return readConfigFile();
    },

    configSummary(): ConfigSummary {
      // Kept synchronous for the interface; getState() feeds it the resolved
      // config so the UI summary matches the file actually loaded.
      return summarizeConfig(this._lastConfig || { config: {}, path: "", is_example: false });
    },

    // Cache of the most recently resolved config so configSummary() (sync) can
    // reflect the same file getState() read.
    _lastConfig: null as ConfigResult | null,

    async writeSnapshot(snapshot: LessonSnapshot): Promise<void> {
      await writeJson(SNAPSHOT_PATH, snapshot);
    },

    async writeDecisions(decisions: DecisionsFile): Promise<void> {
      await writeJson(DECISIONS_PATH, decisions);
    },

    async writeAgentTasks(tasks: AgentTasksFile): Promise<void> {
      await writeJson(AGENT_TASKS_PATH, tasks);
    },

    async writeExecutionReport(report: ExecutionReport): Promise<void> {
      await writeJson(EXECUTION_REPORT_PATH, report);
    },

    async getState(): Promise<LessonState> {
      const [snapshot, decisions, agentTasks, executionReport, onboarding, lock, configResult] = await Promise.all([
        this.readSnapshot(),
        this.readDecisions(),
        this.readAgentTasks(),
        this.readExecutionReport(),
        this.readOnboarding(),
        this.readLock(),
        this.readConfig(),
      ]);
      this._lastConfig = configResult;
      return {
        app: "kelly-lesson",
        data_provider: this.kind,
        onboarding,
        lock,
        config_summary: summarizeConfig(configResult),
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
        snapshot,
      };
    },

    async applyDecision(payload: DecisionBody = {}): Promise<DecisionsFile> {
      const action = String(payload.action || "");
      if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);
      const snapshot = await this.readSnapshot();
      let reviewId = String(payload.review_id || "");
      if (!reviewId && payload.plan_id) {
        const item = (snapshot.review_items || []).find((entry) => entry.plan_id === payload.plan_id);
        if (!item) throw new Error(`No review item for plan: ${payload.plan_id}`);
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
        draft: payload.draft === undefined ? undefined : String(payload.draft),
        decided_at: now,
      };
      decisions.updated_at = now;
      await this.writeDecisions(decisions);
      const tasks = await this.readAgentTasks();
      tasks.tasks = (tasks.tasks || []).filter((task) => task.review_id !== reviewId);
      if (action === "request_changes") {
        tasks.tasks.push({
          task_id: `task-${reviewId}-${Date.now()}`,
          type: "revise_plan",
          review_id: reviewId,
          plan_id: item.plan_id,
          ref: item.ref,
          comment: String(payload.comment || ""),
          draft: payload.draft === undefined ? undefined : String(payload.draft),
          requested_at: now,
          status: "queued",
        });
      }
      tasks.updated_at = now;
      await this.writeAgentTasks(tasks);
      return decisions;
    },
  };
  return provider;
}
