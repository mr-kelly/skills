import path from "node:path";
import { isoNow, pathExists, readJson, writeJson } from "../common.ts";
import {
  AGENT_TASKS_PATH,
  CONFIG_EXAMPLE_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  PROVIDER_CHOICE_PATH,
  SKILL_DIR,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type {
  AgentTasksFile,
  ConfigSummary,
  DecisionBody,
  DecisionsFile,
  ExecutionReport,
  HomeworkSnapshot,
  HomeworkState,
  Lock,
  Onboarding,
  ProviderChoice,
  SetupState,
  WorkflowStatus,
} from "../types.ts";
import type { DataProvider, ProviderStatus } from "./provider-interface.ts";

type ConfigResult = { config: Record<string, any>; path: string; is_example: boolean };

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);
const TASK_BY_TARGET: Record<string, "explain_again" | "generate_practice" | "revise_paper" | "review_mistake"> = {
  question: "explain_again",
  mistake: "review_mistake",
  paper: "revise_paper",
};

function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_HOMEWORK_COACH_CONFIG) paths.push(process.env.KELLY_HOMEWORK_COACH_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-homework-coach", "config.json"));
  paths.push(CONFIG_EXAMPLE_PATH);
  return paths;
}

async function readConfigFile(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Record<string, any>>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: "", is_example: false };
}

function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const profile = config.student_profile || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    student_profile: {
      display_name: String(profile.display_name || ""),
      grade: String(profile.grade || ""),
      language: String(profile.language || "Auto"),
      timezone: String(profile.timezone || ""),
    },
    subjects: Array.isArray(config.subjects) ? config.subjects.map(String) : [],
    learning_policy: sanitizeObject(config.learning_policy || {}),
    practice_defaults: sanitizeObject(config.practice_defaults || {}),
    export: sanitizeObject(config.export || {}),
  };
}

function sanitizeObject(input: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(["api_key", "token", "password", "secret", "cookie"]);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if ([...blocked].some((needle) => key.toLowerCase().includes(needle))) {
      output[key] = Boolean(value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function emptySnapshot(): HomeworkSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-homework-coach",
    profile: { display_name: "", grade: "", language: "Auto" },
    metrics: {
      active_questions: 0,
      mistakes_total: 0,
      due_reviews: 0,
      papers_generated: 0,
      mastery_score: 0,
      questions_analyzed: 0,
    },
    questions: [],
    mistakes: [],
    papers: [],
    review_items: [],
    activity_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No homework snapshot exists yet. Add a question photo or ask the agent to prepare a demo homework batch.",
      },
    ],
  };
}

function setupState(
  onboarding: Onboarding,
  providerChoice: ProviderChoice | null,
  configResult: ConfigResult,
): SetupState {
  const envProvider = process.env.KELLY_HOMEWORK_COACH_DATA_PROVIDER;
  const provider = String(envProvider || providerChoice?.provider || "local");
  const providerSelected = Boolean(envProvider || providerChoice?.provider);
  const hasPrivateConfig = Boolean(configResult.path && !configResult.is_example);
  let state: SetupState["state"] = "choose_provider";
  if (providerSelected && !onboarding.completed) state = "needs_config";
  if (providerSelected && onboarding.completed && hasPrivateConfig) state = "ready";
  return {
    provider_selected: providerSelected,
    provider_env_locked: Boolean(envProvider),
    provider,
    state,
    recommended_config: "~/.config/kelly-homework-coach/config.json",
    recommended_env: "~/.config/kelly-homework-coach/.env",
    example_config: "skills/kelly-homework-coach/config.example.json",
    missing_env: [],
  };
}

function nextStatusForDecision(action: string): WorkflowStatus {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return "needs_review";
}

function updateTargetStatus(snapshot: HomeworkSnapshot, targetId: string, status: WorkflowStatus): HomeworkSnapshot {
  const question = snapshot.questions.find((item) => item.question_id === targetId);
  if (question) question.status = status;
  const mistake = snapshot.mistakes.find((item) => item.mistake_id === targetId);
  if (mistake) mistake.status = status;
  const paper = snapshot.papers.find((item) => item.paper_id === targetId);
  if (paper) paper.status = status;
  const review = snapshot.review_items.find((item) => item.target_id === targetId || item.review_id === targetId);
  if (review) review.status = status;
  return snapshot;
}

export class LocalFileProvider implements DataProvider {
  readonly name = "local";

  async ensureDirs(): Promise<void> {
    await import("node:fs/promises").then((fs) => fs.mkdir(DATA_DIR, { recursive: true }));
  }

  async readSnapshot(): Promise<HomeworkSnapshot> {
    return (await readJson<HomeworkSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as HomeworkSnapshot;
  }

  async writeSnapshot(snapshot: HomeworkSnapshot): Promise<void> {
    await writeJson(SNAPSHOT_PATH, snapshot);
  }

  async readDecisions(): Promise<DecisionsFile> {
    return (await readJson<DecisionsFile>(DECISIONS_PATH, { updated_at: "", decisions: {} })) as DecisionsFile;
  }

  async writeDecisions(decisions: DecisionsFile): Promise<void> {
    await writeJson(DECISIONS_PATH, decisions);
  }

  async getAgentTasks(): Promise<AgentTasksFile> {
    return (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { updated_at: "", tasks: [] })) as AgentTasksFile;
  }

  async writeAgentTasks(tasks: AgentTasksFile): Promise<void> {
    await writeJson(AGENT_TASKS_PATH, tasks);
  }

  async readExecutionReport(): Promise<ExecutionReport | null> {
    return readJson<ExecutionReport>(EXECUTION_REPORT_PATH, null);
  }

  async getOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async completeOnboarding(marker: Record<string, unknown> = {}): Promise<Onboarding> {
    const payload = {
      completed: true,
      completed_at: isoNow(),
      config_version: "1",
      ...marker,
    };
    await writeJson(ONBOARDING_PATH, payload);
    return payload;
  }

  async getLock(): Promise<Lock | null> {
    return readJson<Lock>(LOCK_PATH, null);
  }

  async readProviderChoice(): Promise<ProviderChoice | null> {
    return readJson<ProviderChoice>(PROVIDER_CHOICE_PATH, null);
  }

  async selectProvider(provider: string): Promise<ProviderChoice> {
    const normalized = provider === "busabase" ? "busabase" : "local";
    const payload = { provider: normalized, selected_at: isoNow() };
    await writeJson(PROVIDER_CHOICE_PATH, payload);
    return payload;
  }

  async getConfigSummary(): Promise<ConfigSummary> {
    return summarizeConfig(await readConfigFile());
  }

  async providerStatus(): Promise<ProviderStatus> {
    return {
      ok: true,
      provider: this.name,
      mode: "local-files",
      message: "Local file provider is available.",
      connection: {
        data_dir: DATA_DIR,
        snapshot_exists: await pathExists(SNAPSHOT_PATH),
      },
    };
  }

  async getState(): Promise<HomeworkState> {
    await this.ensureDirs();
    const [snapshot, decisions, agentTasks, executionReport, onboarding, lock, providerChoice, configResult] =
      await Promise.all([
        this.readSnapshot(),
        this.readDecisions(),
        this.getAgentTasks(),
        this.readExecutionReport(),
        this.getOnboarding(),
        this.getLock(),
        this.readProviderChoice(),
        readConfigFile(),
      ]);
    const setup = setupState(onboarding, providerChoice, configResult);
    return {
      app: "kelly-homework-coach",
      data_provider: this.name,
      setup,
      onboarding,
      lock,
      config_summary: summarizeConfig(configResult),
      decisions,
      agent_tasks: agentTasks,
      execution_report: executionReport,
      snapshot: setup.state === "ready" ? snapshot : emptySnapshot(),
    };
  }

  async submitReview(payload: DecisionBody = {}): Promise<DecisionsFile> {
    const action = String(payload.action || "");
    if (!DECISION_ACTIONS.has(action)) throw new Error(`Unsupported action: ${action}`);

    const snapshot = await this.readSnapshot();
    let reviewId = String(payload.review_id || "");
    let review = reviewId ? snapshot.review_items.find((item) => item.review_id === reviewId) : undefined;
    if (!review && payload.target_id) {
      review = snapshot.review_items.find((item) => item.target_id === payload.target_id);
      reviewId = review?.review_id || "";
    }
    if (!review || !reviewId) throw new Error("review_id or target_id is required");

    const now = isoNow();
    const decisions = await this.readDecisions();
    decisions.updated_at = now;
    decisions.decisions[reviewId] = {
      action,
      comment: String(payload.comment || ""),
      edited_note: payload.edited_note ? String(payload.edited_note) : undefined,
      decided_at: now,
    };
    await this.writeDecisions(decisions);

    const nextStatus = nextStatusForDecision(action);
    updateTargetStatus(snapshot, review.target_id, nextStatus);
    const snapshotReview = snapshot.review_items.find((item) => item.review_id === reviewId);
    if (snapshotReview) snapshotReview.status = nextStatus;
    snapshot.activity_log.unshift({
      id: `activity-${reviewId}-${Date.now()}`,
      at: now,
      actor: "reviewer",
      detail: `${action} recorded for ${review.title}`,
    });
    await this.writeSnapshot(snapshot);

    if (action === "request_changes") {
      const tasks = await this.getAgentTasks();
      const taskType = TASK_BY_TARGET[review.target_type] || "review_mistake";
      const existing = tasks.tasks.find((task) => task.review_id === reviewId && task.status === "queued");
      if (existing) {
        existing.comment = String(payload.comment || existing.comment);
        existing.requested_at = now;
      } else {
        tasks.tasks.push({
          task_id: `task-${reviewId}-${Date.now()}`,
          type: taskType,
          review_id: reviewId,
          target_id: review.target_id,
          ref: review.ref,
          comment: String(payload.comment || ""),
          requested_at: now,
          status: "queued",
        });
      }
      tasks.updated_at = now;
      await this.writeAgentTasks(tasks);
    }

    return decisions;
  }
}

export const localFileProvider = new LocalFileProvider();
