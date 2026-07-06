// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes a review protocol over REST, so this is a mapping layer, not
// a backend. A kelly-picks candidate/proposal lives in a Busabase record's commit
// `fields`; an agent-prepared draft is a change_request, the human develop/watch/
// drop verdict is a review, publishing is a merge. The change-request status maps
// back onto kelly-picks' proposal statuses so the UI renders identically to local
// mode.
//
// Config (config.busabase, env overrides win):
//   base_url   KELLY_PICKS_BUSABASE_URL      e.g. http://127.0.0.1:3000
//   base_id    KELLY_PICKS_BUSABASE_BASE_ID  the target Busabase base
//   api_key_env -> reads that env var as a Bearer token (cloud/multi-tenant);
//                  the open-source single-tenant Busabase needs no token.
//
// Planning primitives that the local scripts mutate on disk (snapshot writes,
// the agent lock, execution reports) are local-only; the Busabase surface is
// review-and-publish. Those methods therefore return inert values or throw a
// clear "use local mode" error rather than pretend to persist.

import { emptySnapshot, summarizeConfig } from "../picks-core.ts";
import type {
  AgentTasksFile,
  Candidate,
  ConfigResult,
  DecisionBody,
  DecisionsFile,
  LockInfo,
  Onboarding,
  PicksSnapshot,
  Proposal,
  ProviderMeta,
} from "../types.ts";
import type { DataProvider, PicksState, SaveDecisionResult } from "./provider-interface.ts";

// Busabase change-request status -> kelly-picks proposal status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Fields we round-trip through a Busabase record's commit fields.
const FIELD_KEYS = ["name", "candidate_id", "category", "stage", "verdict", "reason", "brief", "why_it_matters"];

function localOnly(what: string): Error {
  return new Error(
    `${what} is local-only. Use KELLY_PICKS_DATA_PROVIDER=local to run the agent pipeline, then publish to Busabase.`,
  );
}

export function createBusabaseProvider(meta: ProviderMeta = {}): DataProvider {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_PICKS_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_PICKS_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_PICKS_BUSABASE_API_KEY || ""
    : process.env.KELLY_PICKS_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_PICKS_BUSABASE_URL / KELLY_PICKS_BUSABASE_BASE_ID.",
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

  function primaryOperation(cr: any) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToProposal(cr: any): Proposal {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      proposal_id: String(cr.id),
      candidate_id: fields.candidate_id || String(cr.id),
      title: fields.name || "(untitled)",
      verdict: fields.verdict || "watch",
      status: STATUS_MAP[cr.status] || "needs_review",
      reason: fields.reason || "",
      brief: fields.brief || "",
      proposed_at: cr.createdAt || new Date().toISOString(),
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
    };
  }

  function crToCandidate(cr: any): Candidate {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      candidate_id: fields.candidate_id || String(cr.id),
      name: fields.name || "(untitled)",
      category: fields.category || "",
      source: "busabase",
      stage: fields.stage || "reviewing",
      why_it_matters: fields.why_it_matters || "",
      first_seen: cr.createdAt || new Date().toISOString(),
      last_updated: cr.updatedAt || new Date().toISOString(),
    };
  }

  const provider: DataProvider = {
    kind: "busabase",

    async ensureReady() {
      // No local directories to create; connectivity is validated lazily per call.
    },

    async configSummary() {
      const configResult = await this.readConfig();
      return {
        provider: "busabase",
        data_provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        ...summarizeConfig(configResult),
      };
    },

    async readConfig(): Promise<ConfigResult> {
      return {
        config: meta.config || {},
        path: meta.source || "",
        is_example: Boolean(meta.is_example),
      };
    },

    async readSnapshot(): Promise<PicksSnapshot> {
      const state = await this.getState();
      return state.snapshot;
    },

    async writeSnapshot() {
      throw localOnly("Writing the picks snapshot");
    },

    async readDecisions(): Promise<DecisionsFile> {
      // Verdicts live inside Busabase reviews, not a decisions ledger file.
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

    async readExecutionReport() {
      return null;
    },

    async writeExecutionReport() {
      throw localOnly("Writing an execution report");
    },

    async readOnboarding(): Promise<Onboarding> {
      return { completed: true };
    },

    async readLock(): Promise<LockInfo | null> {
      return null;
    },

    async acquireLock() {
      // Busabase serializes writes server-side; no client-held lock file.
    },

    async releaseLock() {
      // No-op — see acquireLock.
    },

    async getState(): Promise<PicksState> {
      const summary = await this.configSummary();
      const base = emptySnapshot();
      try {
        const crs = await api("GET", "/api/v1/change-requests");
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        const proposals = list.map(crToProposal);
        const candidates = list.map(crToCandidate);
        const snapshot: PicksSnapshot = {
          ...base,
          generated_at: new Date().toISOString(),
          source: "busabase",
          candidates,
          proposals,
          metrics: {
            ...base.metrics,
            candidate_count: candidates.length,
            proposals_needs_review: proposals.filter((p) => p.status === "needs_review").length,
            in_development: candidates.filter((c) => c.stage === "develop").length,
            watching: candidates.filter((c) => c.stage === "watch").length,
            dropped: candidates.filter((c) => c.stage === "dropped").length,
          },
        };
        return {
          app: "kelly-picks",
          data_provider: "busabase",
          onboarding: { completed: true },
          lock: null,
          agent_tasks: await this.readAgentTasks(),
          execution_report: null,
          config_summary: summary,
          snapshot,
        };
      } catch (error) {
        return {
          app: "kelly-picks",
          data_provider: "busabase",
          onboarding: { completed: true },
          lock: null,
          agent_tasks: { updated_at: "", tasks: [] },
          execution_report: null,
          config_summary: { ...summary, error: (error as Error).message },
          snapshot: base,
        };
      }
    },

    async saveDecision(body: DecisionBody): Promise<SaveDecisionResult> {
      const id = String(body.id || "");
      const action = String(body.action || "");
      if (!id) return { ok: false, status: 400, error: "Missing item id" };
      try {
        if (action === "develop" || action === "approve") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
            payload: { verdict: "approved", reason: body.comment || undefined },
          });
        } else if (action === "request_changes" || action === "revise") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
            payload: { verdict: "changes_requested", reason: body.comment || "Please revise" },
          });
        } else if (action === "drop" || action === "block") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/close`, {
            reason: body.comment || "Closed by reviewer",
          });
        } else if (action === "watch" || action === "promote") {
          // Watch/promote are radar-planning states with no direct Busabase verb;
          // record them as a comment so the trail is preserved.
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/comments`, {
            payload: { body: `${action}: ${body.comment || ""}`.trim(), author: "kelly-picks" },
          });
        } else {
          return { ok: false, status: 400, error: `Unknown action: ${action}` };
        }
      } catch (error) {
        return { ok: false, status: 502, error: (error as Error).message };
      }
      return { ok: true, decision: { id, action, comment: body.comment || "", decided_at: new Date().toISOString() } };
    },
  };

  void FIELD_KEYS;
  return provider;
}
