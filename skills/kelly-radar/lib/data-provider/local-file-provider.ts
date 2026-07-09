// Local-file RadarProvider: the zero-dependency default.
//
// State lives in app/.data/ as JSON files — radar_snapshot.json, decisions.json,
// agent_tasks.json, onboarding.json, execution_report.json, plus the agent.lock
// guard. This provider is the offline reference implementation of the same review
// model Busabase serves remotely, so KELLY_RADAR_DATA_PROVIDER=local|busabase is a
// config switch, not a rewrite of the UI or scripts. The file paths, JSON shapes,
// and /api/state payload are byte-identical to the original store.ts.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  AGENT_TASKS_PATH,
  DATA_DIR,
  DECISIONS_PATH,
  EXECUTION_REPORT_PATH,
  LOCK_PATH,
  ONBOARDING_PATH,
  SNAPSHOT_PATH,
} from "../paths.ts";
import type {
  AgentTask,
  AgentTaskEntry,
  AgentTasksFile,
  Brief,
  ConfigResult,
  ConfigSummary,
  Decision,
  DecisionBody,
  DecisionsFile,
  Lock,
  Mover,
  Onboarding,
  ProviderMeta,
  RadarSnapshot,
  Report,
  ResearchQuestion,
} from "../types.ts";
import type {
  DecisionResult,
  ExecuteDecisionsResult,
  ExecutionOperation,
  FileReportResult,
  IngestSignalsResult,
  IngestTrendsResult,
  RadarState,
} from "./provider-interface.ts";

const DECISION_KINDS = ["signal", "brief", "opportunity", "report"];
const DECISION_ACTIONS = ["approve", "watch", "ignore", "block", "request_changes"];
const SOURCE_KINDS = ["pricing", "changelog", "landing", "launch", "reviews", "news", "hiring", "community"];
const SEVERITIES = ["high", "medium", "low"];
const MOVER_SOURCES = ["search", "community", "category"];

// ── low-level fs (moved verbatim from the original store.ts) ─────────────────

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

function emptySnapshot(): RadarSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date(0).toISOString(),
    source: "kelly-radar",
    range: { start: "", end: "" },
    metrics: {
      watch_target_count: 0,
      signal_count: 0,
      signals_needs_review: 0,
      questions_open: 0,
      briefs_needs_review: 0,
      reports_ready: 0,
      trend_mover_count: 0,
      opportunities_open: 0,
    },
    watchlist: [],
    signals: [],
    research: { questions: [], briefs: [], reports: [] },
    trends: { movers: [], opportunities: [] },
    sync_log: [
      {
        at: new Date(0).toISOString(),
        actor: "kelly-radar",
        action: "empty_snapshot",
        detail: "No radar snapshot exists yet. Configure the watchlist, then let the agent collect signals.",
      },
    ],
  };
}

function statusForAction(action: string): string {
  if (action === "approve") return "approved";
  if (action === "watch") return "needs_review";
  if (action === "ignore") return "done";
  if (action === "block") return "blocked";
  if (action === "request_changes") return "changes_requested";
  return "needs_review";
}

// Decorate the snapshot with human triage decisions (moved from decisions.ts).
function applyDecisions(snapshot: RadarSnapshot, decisions: DecisionsFile | null): RadarSnapshot {
  const map: Record<string, Decision> = decisions?.decisions || {};
  const decorate = <T extends Record<string, any>>(item: T, idKey: string): T => {
    const decision = map[item[idKey]];
    if (!decision) return item;
    const merged: any = { ...item, triage: decision };
    if (decision.status) merged.status = decision.status;
    return merged;
  };
  const next: RadarSnapshot = { ...snapshot };
  next.signals = (snapshot.signals || []).map((item) => decorate(item, "signal_id"));
  const research = snapshot.research;
  const briefs: Brief[] = (research.briefs || []).map((item) => decorate(item, "brief_id"));
  const reports: Report[] = (research.reports || []).map((item) => {
    const decision = map[item.report_id];
    if (!decision) return item;
    const merged: Report = { ...item, triage: decision };
    if (decision.confidence !== undefined) merged.confidence = decision.confidence;
    return merged;
  });
  const briefById = new Map(briefs.map((brief) => [brief.brief_id, brief]));
  const questions: ResearchQuestion[] = (research.questions || []).map((question) => {
    const brief = briefById.get(question.brief_id);
    if (!brief || question.status !== "brief_needs_review") return question;
    if (brief.status === "approved") return { ...question, status: "researching" };
    if (brief.status === "blocked") return { ...question, status: "closed" };
    return question;
  });
  next.research = { ...research, questions, briefs, reports };
  const trends = snapshot.trends;
  next.trends = {
    ...trends,
    movers: trends.movers || [],
    opportunities: (trends.opportunities || []).map((item) => decorate(item, "opportunity_id")),
  };
  return next;
}

function collectSecretEnvNames(value: unknown, found: Set<string> = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectSecretEnvNames(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (key.endsWith("_env") && typeof inner === "string" && inner) found.add(inner);
      else collectSecretEnvNames(inner, found);
    }
  }
  return found;
}

function contentHash(signal: any): string {
  const diffText = (signal.diff?.lines || []).map((line: any) => `${line.type}:${line.text}`).join("\n");
  return crypto
    .createHash("sha256")
    .update([signal.target_id, signal.source_id, signal.headline, signal.summary, diffText].join("|"))
    .digest("hex");
}

export function createLocalFileProvider(meta: ProviderMeta = {}): import("./provider-interface.ts").RadarProvider {
  const configResult: ConfigResult = meta.configResult || {
    config: (meta.config as any) || { watchlist: [] },
    path: meta.source || "",
    is_example: meta.is_example || false,
  };

  async function readSnapshot(): Promise<RadarSnapshot> {
    return (await readJson<RadarSnapshot>(SNAPSHOT_PATH, emptySnapshot())) as RadarSnapshot;
  }

  async function readDecisions(): Promise<DecisionsFile> {
    return (await readJson<DecisionsFile>(DECISIONS_PATH, { updated_at: "", decisions: {} })) as DecisionsFile;
  }

  async function readAgentTasks(): Promise<AgentTasksFile> {
    return (await readJson<AgentTasksFile>(AGENT_TASKS_PATH, { updated_at: "", tasks: [] })) as AgentTasksFile;
  }

  async function readOnboarding(): Promise<Onboarding> {
    return (await readJson<Onboarding>(ONBOARDING_PATH, { completed: false })) as Onboarding;
  }

  async function getLock(): Promise<Lock | null> {
    return readJson<Lock>(LOCK_PATH, null);
  }

  async function acquireLock(owner: string, message: string): Promise<void> {
    const existing = await getLock();
    if (existing) {
      throw new Error(
        `agent.lock is held by ${existing.owner || "unknown"} (${existing.message || "working"}). Retry after it is released.`,
      );
    }
    await writeJson(LOCK_PATH, { owner, message, started_at: new Date().toISOString() });
  }

  async function releaseLock(): Promise<void> {
    await fs.rm(LOCK_PATH, { force: true });
  }

  async function enqueueAgentTask(entry: AgentTaskEntry): Promise<AgentTask> {
    const tasks = await readAgentTasks();
    const task: AgentTask = {
      task_id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      status: "queued",
      ...entry,
    };
    tasks.tasks.push(task);
    tasks.updated_at = entry.created_at;
    await writeJson(AGENT_TASKS_PATH, tasks);
    return task;
  }

  function summarizeConfig(): ConfigSummary {
    const config = configResult.config || {};
    const watchlist: any[] = Array.isArray(config.watchlist) ? config.watchlist : [];
    const trendSources: any[] = Array.isArray(config.trend_sources) ? config.trend_sources : [];
    const research: Record<string, any> = config.research && typeof config.research === "object" ? config.research : {};
    const profile: Record<string, any> = config.profile && typeof config.profile === "object" ? config.profile : {};
    const secretEnvs: string[] = [...collectSecretEnvNames(config)];
    return {
      provider: "local",
      config_path: configResult.path,
      is_example: configResult.is_example,
      profile: {
        products: (Array.isArray(profile.products) ? profile.products : []).map((product: any) => ({
          name: product.name || "",
          positioning: product.positioning || "",
        })),
      },
      watchlist: watchlist.map((target) => ({
        target_id: target.target_id || "",
        name: target.name || target.target_id || "",
        type: target.type || "",
        source_count: Array.isArray(target.sources) ? target.sources.length : 0,
        methods: [
          ...new Set<string>(
            (Array.isArray(target.sources) ? target.sources : []).map((source: any) => source.method || "manual"),
          ),
        ],
      })),
      research_defaults: {
        default_depth: research.default_depth || "standard",
        source_policy: research.source_policy || "public_pages_only",
        require_citations: research.require_citations !== false,
        max_sources: research.max_sources || 8,
      },
      trend_sources: trendSources.map((source) => ({
        source_id: source.source_id || "",
        kind: source.kind || "",
        name: source.name || source.source_id || "",
        method: source.method || "manual",
      })),
      cadence: config.cadence && typeof config.cadence === "object" ? config.cadence : {},
      env_readiness: secretEnvs.map((name) => ({ name, ready: Boolean(process.env[name]) })),
    };
  }

  return {
    name: "local",

    async readConfig(): Promise<ConfigResult> {
      return configResult;
    },

    readSnapshot,
    readDecisions,
    readAgentTasks,
    readOnboarding,
    getLock,
    acquireLock,
    releaseLock,

    async getConfigSummary(): Promise<ConfigSummary> {
      return summarizeConfig();
    },

    async getState(): Promise<RadarState> {
      const [snapshot, onboarding, lock, decisions, agentTasks] = await Promise.all([
        readSnapshot(),
        readOnboarding(),
        getLock(),
        readDecisions(),
        readAgentTasks(),
      ]);
      return {
        app: "kelly-radar",
        data_provider: "local",
        onboarding,
        lock,
        agent_tasks: agentTasks,
        config_summary: summarizeConfig(),
        snapshot: applyDecisions(snapshot, decisions),
      };
    },

    async saveDecision(body: DecisionBody): Promise<DecisionResult> {
      const lock = await getLock();
      if (lock) {
        return { ok: false, status: 423, error: `Locked by ${lock.owner || "agent"}: ${lock.message || "working"}` };
      }
      const kind = String(body.kind || "");
      const id = String(body.id || "");
      const action = String(body.action || "");
      if (!DECISION_KINDS.includes(kind)) return { ok: false, status: 400, error: `Unknown decision kind: ${kind}` };
      if (!id) return { ok: false, status: 400, error: "Missing item id" };
      if (!DECISION_ACTIONS.includes(action)) return { ok: false, status: 400, error: `Unknown action: ${action}` };

      const now = new Date().toISOString();
      const decisions = await readDecisions();
      const decision: Decision = {
        kind,
        action,
        status: statusForAction(action),
        comment: typeof body.comment === "string" ? body.comment : "",
        decided_at: now,
      };
      if (kind === "report" && body.confidence !== undefined) {
        const confidence = Number(body.confidence);
        if (Number.isFinite(confidence)) decision.confidence = Math.min(5, Math.max(0, confidence));
      }
      decisions.decisions[id] = decision;
      decisions.updated_at = now;
      await writeJson(DECISIONS_PATH, decisions);

      if (action === "request_changes" || action === "block") {
        await enqueueAgentTask({
          kind: kind === "brief" ? "revise_brief" : kind === "signal" ? "collect_more_evidence" : `revise_${kind}`,
          ref_id: id,
          note: decision.comment,
          created_at: now,
        });
      }
      return { ok: true, decision: { id, ...decision } };
    },

    async saveFollowup(body: DecisionBody): Promise<DecisionResult> {
      const lock = await getLock();
      if (lock) {
        return { ok: false, status: 423, error: `Locked by ${lock.owner || "agent"}: ${lock.message || "working"}` };
      }
      const questionId = String(body.question_id || "");
      const question = String(body.question || "").trim();
      if (!questionId || !question) return { ok: false, status: 400, error: "Missing question_id or question" };
      const now = new Date().toISOString();
      const task = await enqueueAgentTask({
        kind: "research_followup",
        ref_id: questionId,
        note: question,
        created_at: now,
      });
      return { ok: true, task: { ...task } };
    },

    async ingestSignals(payload: any): Promise<IngestSignalsResult> {
      if (!payload || !Array.isArray(payload.signals)) {
        throw new Error("payload must contain a signals[] array");
      }
      payload.signals.forEach((signal: any, index: number) => {
        for (const key of ["target_id", "source_id", "source_kind", "headline", "summary", "detected_at"]) {
          if (typeof signal[key] !== "string" || !signal[key]) {
            throw new Error(`signals[${index}].${key} must be a non-empty string`);
          }
        }
        if (!SOURCE_KINDS.includes(signal.source_kind)) {
          throw new Error(`signals[${index}].source_kind must be one of ${SOURCE_KINDS.join("|")}`);
        }
        if (signal.severity && !SEVERITIES.includes(signal.severity)) {
          throw new Error(`signals[${index}].severity must be one of ${SEVERITIES.join("|")}`);
        }
        if (signal.diff && !Array.isArray(signal.diff.lines)) {
          throw new Error(`signals[${index}].diff.lines must be an array`);
        }
        if (signal.evidence && !Array.isArray(signal.evidence)) {
          throw new Error(`signals[${index}].evidence must be an array`);
        }
      });

      const now = new Date().toISOString();
      await acquireLock("kelly-radar/ingest_signals", `Ingesting ${payload.signals.length} signals`);
      try {
        const snapshot = (await readJson<RadarSnapshot>(SNAPSHOT_PATH, null)) || emptySnapshot();
        snapshot.signals = snapshot.signals || [];
        snapshot.watchlist = snapshot.watchlist || [];
        const existingHashes = new Set(snapshot.signals.map((signal) => signal.content_hash).filter(Boolean));

        let added = 0;
        let skipped = 0;
        for (const incoming of payload.signals as any[]) {
          const hash = incoming.content_hash || contentHash(incoming);
          if (existingHashes.has(hash)) {
            skipped += 1;
            continue;
          }
          existingHashes.add(hash);
          snapshot.signals.push({
            signal_id: incoming.signal_id || `sig-${hash.slice(0, 10)}`,
            target_id: incoming.target_id,
            source_id: incoming.source_id,
            source_kind: incoming.source_kind,
            headline: incoming.headline,
            summary: incoming.summary,
            why_it_matters: incoming.why_it_matters || "",
            severity: incoming.severity || "medium",
            detected_at: incoming.detected_at,
            status: "needs_review",
            proposed_action: incoming.proposed_action || "watch",
            ...(incoming.handoff ? { handoff: incoming.handoff } : {}),
            ...(incoming.diff ? { diff: incoming.diff } : {}),
            evidence: incoming.evidence || [],
            content_hash: hash,
          });
          added += 1;

          let target = snapshot.watchlist.find((entry) => entry.target_id === incoming.target_id);
          if (!target) {
            target = {
              target_id: incoming.target_id,
              name: incoming.target_name || incoming.target_id,
              type: incoming.target_type || "competitor",
              status: "ok",
              notes: "Auto-created by ingest_signals; review in config.",
              last_check_at: now,
              signals_7d: 0,
              sources: [],
            };
            snapshot.watchlist.push(target);
          }
          target.last_check_at = payload.collected_at || now;
          if (!target.sources.some((source) => source.source_id === incoming.source_id)) {
            target.sources.push({
              source_id: incoming.source_id,
              kind: incoming.source_kind,
              url: incoming.source_url || "",
              method: incoming.source_method || "browser_agent",
              last_check_at: payload.collected_at || now,
              last_change_at: incoming.detected_at,
            });
          } else {
            const source = target.sources.find((entry) => entry.source_id === incoming.source_id);
            if (source) {
              source.last_check_at = payload.collected_at || now;
              source.last_change_at = incoming.detected_at;
            }
          }
        }

        const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
        for (const target of snapshot.watchlist) {
          target.signals_7d = snapshot.signals.filter(
            (signal) => signal.target_id === target.target_id && new Date(signal.detected_at).getTime() >= weekAgo,
          ).length;
        }

        snapshot.generated_at = now;
        snapshot.source = "kelly-radar";
        snapshot.metrics = {
          ...snapshot.metrics,
          watch_target_count: snapshot.watchlist.length,
          signal_count: snapshot.signals.length,
          signals_needs_review: snapshot.signals.filter((signal) => signal.status === "needs_review").length,
        };
        snapshot.sync_log = snapshot.sync_log || [];
        snapshot.sync_log.unshift({
          at: now,
          actor: "kelly-radar-agent",
          action: "ingest_signals",
          detail: `${added} new signals added, ${skipped} duplicates skipped.`,
        });
        snapshot.sync_log = snapshot.sync_log.slice(0, 50);

        await writeJson(SNAPSHOT_PATH, snapshot);
        return { added, skipped, snapshot_path: SNAPSHOT_PATH };
      } finally {
        await releaseLock();
      }
    },

    async ingestTrends(payload: any, seoImported: any[] = []): Promise<IngestTrendsResult> {
      if (!payload || !Array.isArray(payload.movers)) throw new Error("payload must contain a movers[] array");
      payload.movers.forEach((mover: any, index: number) => {
        if (typeof mover.keyword !== "string" || !mover.keyword) {
          throw new Error(`movers[${index}].keyword must be a non-empty string`);
        }
        if (!MOVER_SOURCES.includes(mover.source)) {
          throw new Error(`movers[${index}].source must be one of ${MOVER_SOURCES.join("|")}`);
        }
        if (mover.momentum && !Array.isArray(mover.momentum)) {
          throw new Error(`movers[${index}].momentum must be an array of numbers`);
        }
      });

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      await acquireLock("kelly-radar/ingest_trends", "Ingesting trend movers");
      try {
        const snapshot = (await readJson<RadarSnapshot>(SNAPSHOT_PATH, null)) || emptySnapshot();
        snapshot.trends = snapshot.trends || { movers: [], opportunities: [] };
        snapshot.trends.movers = snapshot.trends.movers || [];
        snapshot.trends.opportunities = snapshot.trends.opportunities || [];

        const keyFor = (mover: { keyword: string; source: string }) =>
          `${mover.keyword.toLowerCase()}::${mover.source}`;
        const byKey = new Map<string, Mover>(snapshot.trends.movers.map((mover) => [keyFor(mover), mover]));

        let added = 0;
        let updated = 0;
        for (const incoming of [...payload.movers, ...seoImported] as any[]) {
          const existing = byKey.get(keyFor(incoming));
          if (existing) {
            existing.volume_proxy = Number(incoming.volume_proxy ?? existing.volume_proxy ?? 0);
            existing.delta_pct = Number(incoming.delta_pct ?? existing.delta_pct ?? 0);
            if (Array.isArray(incoming.momentum) && incoming.momentum.length) existing.momentum = incoming.momentum;
            existing.last_updated = now;
            updated += 1;
          } else {
            const mover: Mover = {
              mover_id:
                incoming.mover_id ||
                `mv-${incoming.keyword
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")}-${incoming.source}`,
              keyword: incoming.keyword,
              source: incoming.source,
              volume_proxy: Number(incoming.volume_proxy ?? 0),
              delta_pct: Number(incoming.delta_pct ?? 0),
              momentum: Array.isArray(incoming.momentum) ? incoming.momentum : [],
              first_seen: incoming.first_seen || today,
              last_updated: now,
              opportunity_id: incoming.opportunity_id || "",
            };
            snapshot.trends.movers.push(mover);
            byKey.set(keyFor(mover), mover);
            added += 1;
          }
        }

        const opportunityIds = new Set(snapshot.trends.opportunities.map((item) => item.opportunity_id));
        let opportunitiesAdded = 0;
        for (const incoming of Array.isArray(payload.opportunities) ? payload.opportunities : []) {
          if (!incoming.opportunity_id || opportunityIds.has(incoming.opportunity_id)) continue;
          snapshot.trends.opportunities.push({
            status: "needs_review",
            created_at: now,
            mover_ids: [],
            ...incoming,
          });
          opportunityIds.add(incoming.opportunity_id);
          opportunitiesAdded += 1;
        }

        snapshot.generated_at = now;
        snapshot.source = "kelly-radar";
        snapshot.metrics = {
          ...snapshot.metrics,
          trend_mover_count: snapshot.trends.movers.length,
          opportunities_open: snapshot.trends.opportunities.filter((item) => item.status === "needs_review").length,
        };
        snapshot.sync_log = snapshot.sync_log || [];
        snapshot.sync_log.unshift({
          at: now,
          actor: "kelly-radar-agent",
          action: "ingest_trends",
          detail: `${added} movers added, ${updated} updated, ${opportunitiesAdded} opportunities added${seoImported.length ? `, ${seoImported.length} rising queries imported from kelly-seo` : ""}.`,
        });
        snapshot.sync_log = snapshot.sync_log.slice(0, 50);

        await writeJson(SNAPSHOT_PATH, snapshot);
        return {
          added,
          updated,
          opportunities_added: opportunitiesAdded,
          seo_imported: seoImported.length,
          snapshot_path: SNAPSHOT_PATH,
        };
      } finally {
        await releaseLock();
      }
    },

    async fileReport(payload: any): Promise<FileReportResult> {
      const now = new Date().toISOString();
      await acquireLock(
        "kelly-radar/file_report",
        `Filing ${payload.brief ? "brief" : "report"} for ${payload.question_id}`,
      );
      try {
        const snapshot = (await readJson<RadarSnapshot>(SNAPSHOT_PATH, null)) || emptySnapshot();
        snapshot.research = snapshot.research || { questions: [], briefs: [], reports: [] };
        const { questions, briefs, reports } = snapshot.research;

        let question = questions.find((entry) => entry.question_id === payload.question_id);
        if (!question) {
          if (typeof payload.question !== "string" || !payload.question) {
            throw new Error(`question ${payload.question_id} not found; include payload.question to create it`);
          }
          question = {
            question_id: payload.question_id,
            question: payload.question,
            status: "brief_needs_review",
            asked_at: now,
            depth: payload.depth || "standard",
            cost_note: payload.cost_note || "",
            brief_id: "",
            report_id: "",
            confidence: null,
            followups: [],
          };
          questions.push(question);
        }

        let detail = "";
        if (payload.brief) {
          const brief: Brief = {
            status: "needs_review",
            drafted_at: now,
            depth: question.depth || "standard",
            notes: "",
            ...payload.brief,
            question_id: payload.question_id,
          };
          const index = briefs.findIndex((entry) => entry.brief_id === brief.brief_id);
          if (index >= 0) briefs[index] = brief;
          else briefs.push(brief);
          question.brief_id = brief.brief_id;
          question.status = "brief_needs_review";
          detail = `Brief ${brief.brief_id} filed for '${question.question}'. Awaiting approval.`;
        } else {
          const report: Report = {
            filed_at: now,
            confidence: null,
            annotations: [],
            ...payload.report,
            question_id: payload.question_id,
          };
          const index = reports.findIndex((entry) => entry.report_id === report.report_id);
          if (index >= 0)
            reports[index] = {
              ...report,
              annotations: reports[index].annotations?.length ? reports[index].annotations : report.annotations,
            };
          else reports.push(report);
          question.report_id = report.report_id;
          question.status = "report_ready";
          detail = `Report ${report.report_id} filed for '${question.question}' with ${report.sources.length} cited sources.`;
        }

        snapshot.generated_at = now;
        snapshot.source = "kelly-radar";
        snapshot.metrics = {
          ...snapshot.metrics,
          questions_open: questions.filter((entry) => entry.status !== "closed").length,
          briefs_needs_review: briefs.filter((entry) => entry.status === "needs_review").length,
          reports_ready: questions.filter((entry) => entry.status === "report_ready").length,
        };
        snapshot.sync_log = snapshot.sync_log || [];
        snapshot.sync_log.unshift({ at: now, actor: "kelly-radar-agent", action: "file_report", detail });
        snapshot.sync_log = snapshot.sync_log.slice(0, 50);

        await writeJson(SNAPSHOT_PATH, snapshot);
        return { detail, snapshot_path: SNAPSHOT_PATH };
      } finally {
        await releaseLock();
      }
    },

    async executeDecisions(apply: boolean): Promise<ExecuteDecisionsResult> {
      const now = new Date().toISOString();
      await acquireLock(
        "kelly-radar/execute_decisions",
        apply ? "Applying approved decisions" : "Dry-run of approved decisions",
      );
      try {
        const raw: RadarSnapshot = (await readJson<RadarSnapshot>(SNAPSHOT_PATH, null)) || emptySnapshot();
        const decisions = await readDecisions();
        const snapshot = applyDecisions(raw, decisions);
        const operations: ExecutionOperation[] = [];

        for (const signal of snapshot.signals || []) {
          // Gate on the raw decision record itself, not just the decorated/merged
          // status, so a status field the agent set on the item can never masquerade
          // as a real human approval — and so marking the decision "done" after
          // execution reliably prevents re-triggering on the next run.
          if (decisions.decisions[signal.signal_id]?.status !== "approved") continue;
          const handoff = signal.handoff || { operation: "start_research", target: "", summary: "" };
          operations.push({
            id: signal.signal_id,
            kind: "signal",
            operation: handoff.operation,
            target: handoff.target || "",
            summary: handoff.summary || signal.headline,
            note: signal.triage?.comment || "",
            dry_run: !apply,
            status: apply ? "executed" : "planned",
          });
        }

        for (const brief of snapshot.research?.briefs || []) {
          if (decisions.decisions[brief.brief_id]?.status !== "approved") continue;
          const question = (snapshot.research?.questions || []).find((entry) => entry.brief_id === brief.brief_id);
          if (!question || !["brief_needs_review", "researching"].includes(question.status)) continue;
          operations.push({
            id: brief.brief_id,
            kind: "brief",
            operation: "start_research",
            target: question.question_id,
            summary: `Run approved brief for: ${question.question}`,
            note: brief.triage?.comment || "",
            dry_run: !apply,
            status: apply ? "executed" : "planned",
          });
        }

        for (const opportunity of snapshot.trends?.opportunities || []) {
          if (decisions.decisions[opportunity.opportunity_id]?.status !== "approved") continue;
          const step = opportunity.proposed_next_step || ({} as Partial<typeof opportunity.proposed_next_step>);
          operations.push({
            id: opportunity.opportunity_id,
            kind: "opportunity",
            operation: step.operation || "handoff_content_brief",
            target: step.target || "",
            summary: step.summary || opportunity.title,
            note: opportunity.triage?.comment || "",
            dry_run: !apply,
            status: apply ? "executed" : "planned",
          });
        }

        // Merge this run's operations into the execution report by id instead of
        // overwriting the whole file, so earlier runs' results aren't lost.
        const previousReport = await readJson<{ operations?: ExecutionOperation[] }>(EXECUTION_REPORT_PATH, null);
        const operationsById = new Map<string, ExecutionOperation>(
          (previousReport?.operations || []).map((op) => [op.id, op]),
        );
        for (const op of operations) operationsById.set(op.id, op);
        const mergedOperations = Array.from(operationsById.values());

        const report = {
          generated_at: now,
          source: "kelly-radar",
          dry_run: !apply,
          operation_count: mergedOperations.length,
          operations: mergedOperations,
        };
        await writeJson(EXECUTION_REPORT_PATH, report);

        if (apply && operations.length) {
          const doneSignalIds = new Set(operations.filter((op) => op.kind === "signal").map((op) => op.id));
          const doneOpportunityIds = new Set(operations.filter((op) => op.kind === "opportunity").map((op) => op.id));
          raw.signals = (raw.signals || []).map((signal) =>
            doneSignalIds.has(signal.signal_id) ? { ...signal, status: "done" } : signal,
          );
          raw.trends = raw.trends || { movers: [], opportunities: [] };
          raw.trends.opportunities = (raw.trends.opportunities || []).map((item) =>
            doneOpportunityIds.has(item.opportunity_id) ? { ...item, status: "done" } : item,
          );
          raw.generated_at = now;
          raw.sync_log = raw.sync_log || [];
          raw.sync_log.unshift({
            at: now,
            actor: "kelly-radar-agent",
            action: "execute_decisions",
            detail: `${operations.length} approved operations recorded as executed handoffs.`,
          });
          raw.sync_log = raw.sync_log.slice(0, 50);
          await writeJson(SNAPSHOT_PATH, raw);

          // Mark the underlying decisions terminal ('done') so a lingering 'approved'
          // decision in decisions.json can't re-trigger the same handoff on the next
          // --apply run (applyDecisions() always overlays decision.status onto the item).
          const executedIds = new Set(operations.map((op) => op.id));
          for (const id of executedIds) {
            const decision = decisions.decisions[id];
            if (decision && decision.status !== "done") decisions.decisions[id] = { ...decision, status: "done" };
          }
          decisions.updated_at = now;
          await writeJson(DECISIONS_PATH, decisions);
        }

        return { apply, operations, report_path: EXECUTION_REPORT_PATH };
      } finally {
        await releaseLock();
      }
    },

    async writeDemoSnapshot(): Promise<{ snapshot_path: string }> {
      const { demoSnapshot } = await import("../../app/server/demo.ts");
      const snapshot = demoSnapshot("overview");
      snapshot.demo_scenario = undefined;
      snapshot.source = "kelly-radar-demo";
      await fs.mkdir(DATA_DIR, { recursive: true });
      await writeJson(SNAPSHOT_PATH, snapshot);
      return { snapshot_path: SNAPSHOT_PATH };
    },
  };
}
