// Busabase RadarProvider: a thin HTTP client to a Busabase base.
//
// Busabase (#4437) publishes the whole review protocol over REST, so this is a
// mapping layer, not a backend. A radar item — a competitor signal, a research
// brief, a report, or a trend opportunity — lives in a Busabase record's commit
// `fields`; an agent draft is a change_request, the human triage verdict is a
// review, publishing is a merge. The change-request status maps back onto
// kelly-radar's workflow statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_RADAR_BUSABASE_URL      e.g. http://127.0.0.1:3000
//   base_id       KELLY_RADAR_BUSABASE_BASE_ID  the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`. Trend ingestion, report filing, and the
// execution/demo write-paths are planning stages that stay local-only; publish
// to Busabase from local mode, then review remotely.

import type {
  AgentTasksFile,
  ConfigResult,
  ConfigSummary,
  DecisionBody,
  DecisionsFile,
  Lock,
  Onboarding,
  ProviderMeta,
  RadarSnapshot,
} from "../types.ts";
import type {
  DecisionResult,
  ExecuteDecisionsResult,
  FileReportResult,
  IngestSignalsResult,
  IngestTrendsResult,
  RadarState,
} from "./provider-interface.ts";

// Busabase change-request status -> kelly-radar signal workflow status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const SIGNAL_FIELD_KEYS = [
  "target_id",
  "source_id",
  "source_kind",
  "severity",
  "detected_at",
  "headline",
  "summary",
  "why_it_matters",
  "proposed_action",
];

function localOnly(what: string): never {
  const error = new Error(
    `${what} is a local-only planning stage. Use KELLY_RADAR_DATA_PROVIDER=local to prepare, then publish to Busabase.`,
  ) as Error & { statusCode?: number };
  error.statusCode = 400;
  throw error;
}

function emptySnapshot(source: string): RadarSnapshot {
  return {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    source,
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
    sync_log: [],
  };
}

export function createBusabaseProvider(meta: ProviderMeta = {}): import("./provider-interface.ts").RadarProvider {
  const configResult: ConfigResult = meta.configResult || {
    config: (meta.config as any) || { watchlist: [] },
    path: meta.source || "",
    is_example: meta.is_example || false,
  };
  const busa = configResult.config?.busabase || {};
  const baseUrl = (process.env.KELLY_RADAR_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_RADAR_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_RADAR_BUSABASE_API_KEY || ""
    : process.env.KELLY_RADAR_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_RADAR_BUSABASE_URL / KELLY_RADAR_BUSABASE_BASE_ID.",
      );
    }
  }

  async function api(method: string, pathname: string, body?: unknown) {
    requireConfig();
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`busabase ${method} ${pathname} -> ${res.status} ${detail}`.trim());
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function pickFields(item: any) {
    const fields: Record<string, unknown> = {};
    for (const key of SIGNAL_FIELD_KEYS) {
      if (item[key] !== undefined) fields[key] = item[key];
    }
    return fields;
  }

  function primaryOperation(cr: any) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToSignal(cr: any) {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      signal_id: cr.id,
      target_id: fields.target_id || "busabase",
      source_id: fields.source_id || "busabase",
      source_kind: fields.source_kind || "news",
      severity: fields.severity || "medium",
      detected_at: fields.detected_at || new Date().toISOString(),
      status: STATUS_MAP[cr.status] || "needs_review",
      headline: fields.headline || "(untitled)",
      summary: fields.summary || "",
      why_it_matters: fields.why_it_matters || "",
      content_hash: String(cr.id),
      evidence: Array.isArray(fields.evidence) ? fields.evidence : [],
      proposed_action: fields.proposed_action || "watch",
    };
  }

  function configSummary(): ConfigSummary {
    const config = configResult.config || {};
    const watchlist: any[] = Array.isArray(config.watchlist) ? config.watchlist : [];
    const trendSources: any[] = Array.isArray(config.trend_sources) ? config.trend_sources : [];
    const research: Record<string, any> = config.research && typeof config.research === "object" ? config.research : {};
    const profile: Record<string, any> = config.profile && typeof config.profile === "object" ? config.profile : {};
    return {
      provider: "busabase",
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
      env_readiness: [],
      busabase: {
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
      },
    };
  }

  async function readSnapshot(): Promise<RadarSnapshot> {
    const snapshot = emptySnapshot("busabase");
    try {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      snapshot.signals = list.map(crToSignal);
      snapshot.metrics.signal_count = snapshot.signals.length;
      snapshot.metrics.signals_needs_review = snapshot.signals.filter(
        (signal) => signal.status === "needs_review",
      ).length;
    } catch (error) {
      snapshot.sync_log.unshift({
        at: new Date().toISOString(),
        actor: "kelly-radar",
        action: "busabase_error",
        detail: (error as Error).message,
      });
    }
    return snapshot;
  }

  async function getLock(): Promise<Lock | null> {
    return null;
  }

  return {
    name: "busabase",

    async readConfig(): Promise<ConfigResult> {
      return configResult;
    },

    readSnapshot,

    async readDecisions(): Promise<DecisionsFile> {
      return { updated_at: "", decisions: {} };
    },

    async readAgentTasks(): Promise<AgentTasksFile> {
      try {
        const tasks = await api("GET", "/api/v1/agent/tasks");
        const list = Array.isArray(tasks) ? tasks : tasks?.items || [];
        return { updated_at: new Date().toISOString(), tasks: list };
      } catch {
        return { updated_at: "", tasks: [] };
      }
    },

    async readOnboarding(): Promise<Onboarding> {
      return { completed: true };
    },

    getLock,

    async acquireLock(): Promise<void> {
      // Busabase serializes writes server-side; no local lock file to hold.
    },

    async releaseLock(): Promise<void> {},

    async getConfigSummary(): Promise<ConfigSummary> {
      return configSummary();
    },

    async getState(): Promise<RadarState> {
      const [snapshot, agentTasks] = await Promise.all([readSnapshot(), this.readAgentTasks()]);
      return {
        app: "kelly-radar",
        data_provider: "busabase",
        onboarding: { completed: true },
        lock: null,
        agent_tasks: agentTasks,
        config_summary: configSummary(),
        snapshot,
      };
    },

    async saveDecision(body: DecisionBody): Promise<DecisionResult> {
      const id = String(body.id || "");
      const action = String(body.action || "");
      if (!id) return { ok: false, status: 400, error: "Missing item id" };
      try {
        if (action === "approve") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
            payload: { verdict: "approved", reason: body.comment || undefined },
          });
        } else if (action === "request_changes") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
            payload: { verdict: "rejected", reason: body.comment || "Please revise" },
          });
        } else if (action === "block" || action === "ignore") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/close`, {
            reason: body.comment || "Closed by reviewer",
          });
        } else if (action === "watch") {
          // "watch" is a soft hold with no Busabase state change.
        } else {
          return { ok: false, status: 400, error: `Unknown action: ${action}` };
        }
      } catch (error) {
        return { ok: false, status: 502, error: (error as Error).message };
      }
      return { ok: true, decision: { id, action } };
    },

    async saveFollowup(body: DecisionBody): Promise<DecisionResult> {
      const questionId = String(body.question_id || "");
      const question = String(body.question || "").trim();
      if (!questionId || !question) return { ok: false, status: 400, error: "Missing question_id or question" };
      try {
        await api("POST", "/api/v1/agent/tasks", {
          payload: { kind: "research_followup", ref_id: questionId, note: question },
        });
      } catch (error) {
        return { ok: false, status: 502, error: (error as Error).message };
      }
      return { ok: true, task: { kind: "research_followup", ref_id: questionId, note: question, status: "queued" } };
    },

    async ingestSignals(payload: any): Promise<IngestSignalsResult> {
      const signals = Array.isArray(payload?.signals) ? payload.signals : [];
      let added = 0;
      for (const signal of signals) {
        await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(signal),
            message: `Signal for ${signal.target_id || "watch target"}`,
            submittedBy: "kelly-radar",
          },
        });
        added += 1;
      }
      return { added, skipped: 0, snapshot_path: `${baseUrl} (base ${baseId})` };
    },

    async ingestTrends(): Promise<IngestTrendsResult> {
      return localOnly("Trend ingestion");
    },

    async fileReport(): Promise<FileReportResult> {
      return localOnly("Filing research briefs/reports");
    },

    async executeDecisions(apply: boolean): Promise<ExecuteDecisionsResult> {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      const operations = [];
      for (const cr of list) {
        if (cr.status !== "approved") continue;
        if (apply) await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/merge`, {});
        operations.push({
          id: cr.id,
          kind: "signal",
          operation: "merge",
          target: "",
          summary: `Merge approved change request ${cr.id}`,
          note: "",
          dry_run: !apply,
          status: apply ? "executed" : "planned",
        });
      }
      return { apply, operations, report_path: `${baseUrl} (base ${baseId})` };
    },

    async writeDemoSnapshot(): Promise<{ snapshot_path: string }> {
      return localOnly("Writing the demo snapshot");
    },
  };
}
