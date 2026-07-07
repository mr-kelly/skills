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
  BrandProfile,
  Config,
  ConfigResult,
  ConfigSummary,
  DecisionBody,
  DecisionsFile,
  ExecutionReport,
  Lock,
  Onboarding,
  ProviderMeta,
  ScalePptxSnapshot,
  ScalePptxState,
  StyleSystem,
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

function defaultStyleSystem(): StyleSystem {
  return {
    style_system_id: "style-nanzhi-soft-classroom",
    name: "Nanzhi Soft Classroom",
    palette: ["#F7A66A", "#FFF6E8", "#2F4F46", "#5A9D8C", "#C94F4F"],
    fonts: { heading: "Arial Rounded MT Bold", body: "Aptos", chinese: "PingFang SC" },
    visual_rules: [
      "Use warm classroom colors with one clear accent per slide.",
      "Prefer friendly illustration or bright inspectable photos over abstract decoration.",
      "Keep Chinese prompts large enough for children to read from a screen.",
    ],
    layout_rules: [
      "One teaching objective per slide.",
      "Use stable slide families: cover, vocabulary, image prompt, dialogue, practice, game, summary.",
      "Do not crowd bilingual text; split dense content into multiple slides.",
    ],
    component_library: [
      "warm title band",
      "image plus prompt",
      "vocabulary chips",
      "teacher note strip",
      "review badge",
    ],
  };
}

function normalizeBrand(input: Partial<BrandProfile> = {}): BrandProfile {
  return {
    client_id: input.client_id || "client-nanzhi",
    name: input.name || "Nanzhi Chinese",
    audience: input.audience || "Young Chinese learners and overseas families",
    language_mode: input.language_mode || "zh+pinyin+light_en",
    style_system_id: input.style_system_id || "style-nanzhi-soft-classroom",
  };
}

function normalizeStyle(input: Partial<StyleSystem> = {}): StyleSystem {
  const fallback = defaultStyleSystem();
  return {
    style_system_id: input.style_system_id || fallback.style_system_id,
    name: input.name || fallback.name,
    palette: Array.isArray(input.palette) && input.palette.length ? input.palette : fallback.palette,
    fonts: {
      heading: input.fonts?.heading || fallback.fonts.heading,
      body: input.fonts?.body || fallback.fonts.body,
      chinese: input.fonts?.chinese || fallback.fonts.chinese,
    },
    visual_rules:
      Array.isArray(input.visual_rules) && input.visual_rules.length ? input.visual_rules : fallback.visual_rules,
    layout_rules:
      Array.isArray(input.layout_rules) && input.layout_rules.length ? input.layout_rules : fallback.layout_rules,
    component_library:
      Array.isArray(input.component_library) && input.component_library.length
        ? input.component_library
        : fallback.component_library,
  };
}

export function emptySnapshot(): ScalePptxSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-scale-pptx",
    brand_profiles: [normalizeBrand()],
    style_systems: [defaultStyleSystem()],
    projects: [],
    decks: [],
    slide_cards: [],
    qa_checks: [],
    exports: [],
    review_items: [],
    activity_log: [],
    warnings: [
      {
        id: "no-snapshot",
        severity: "info",
        message:
          "No courseware snapshot exists yet. Import a content table or ask the agent to create a starter PPTX project.",
      },
    ],
    metrics: {
      project_count: 0,
      deck_count: 0,
      slide_count: 0,
      slides_needs_review: 0,
      slides_approved: 0,
      decks_generated: 0,
      qa_warnings: 0,
      avg_style_score: 0,
    },
  };
}

function configSearchPaths(): string[] {
  const paths: string[] = [];
  if (process.env.KELLY_SCALE_PPTX_CONFIG) paths.push(process.env.KELLY_SCALE_PPTX_CONFIG);
  paths.push(path.join(SKILL_DIR, "config.local.json"));
  paths.push(path.join(process.env.HOME || "", ".config", "kelly-scale-pptx", "config.json"));
  paths.push(path.join(SKILL_DIR, "config.example.json"));
  return paths;
}

async function readConfigFile(): Promise<ConfigResult> {
  for (const file of configSearchPaths()) {
    const config = await readJson<Config>(file, null);
    if (config) return { config, path: file, is_example: file.endsWith("config.example.json") };
  }
  return { config: {}, path: null, is_example: false };
}

function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  const exportPrefs = config.export || {};
  const styles = (Array.isArray(config.style_systems) ? config.style_systems : [defaultStyleSystem()]).map(
    normalizeStyle,
  );
  const brands = (Array.isArray(config.brand_profiles) ? config.brand_profiles : [normalizeBrand()]).map(
    normalizeBrand,
  );
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    default_brand_id: config.default_brand_id || brands[0]?.client_id || "client-nanzhi",
    brand_profiles: brands,
    style_systems: styles,
    export: {
      out_dir: exportPrefs.out_dir || "exports",
      render_dir: exportPrefs.render_dir || "exports/rendered",
      pptx_template: exportPrefs.pptx_template || "",
      require_render_qa: exportPrefs.require_render_qa ?? true,
    },
  };
}

const DECISION_ACTIONS = new Set(["approve", "request_changes", "block", "revise"]);

export function createLocalFileProvider(_meta: ProviderMeta = {}) {
  const provider = {
    kind: "local",
    _lastConfig: null as ConfigResult | null,

    async readSnapshot(): Promise<ScalePptxSnapshot> {
      return (await readJson<ScalePptxSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as ScalePptxSnapshot;
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
      return summarizeConfig(this._lastConfig || { config: {}, path: null, is_example: false });
    },

    async writeSnapshot(snapshot: ScalePptxSnapshot): Promise<void> {
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

    async getState(): Promise<ScalePptxState> {
      await fs.mkdir(DATA_DIR, { recursive: true });
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
        app: "kelly-scale-pptx",
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
      if (!reviewId && payload.target_id) {
        const item = (snapshot.review_items || []).find((entry) => entry.target_id === payload.target_id);
        if (!item) throw new Error(`No review item for target: ${payload.target_id}`);
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
          type: item.target_type === "slide" ? "revise_slide_card" : "revise_deck_plan",
          review_id: reviewId,
          target_type: item.target_type,
          target_id: item.target_id,
          ref: item.ref,
          comment: String(payload.comment || ""),
          draft: payload.draft === undefined ? item.draft_note : String(payload.draft),
          requested_at: now,
          status: "open",
        });
      }
      tasks.updated_at = now;
      await this.writeAgentTasks(tasks);
      return decisions;
    },
  };
  return provider;
}
