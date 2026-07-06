// Busabase TicketsProvider: a thin HTTP client to a Busabase base.
//
// Busabase (#4437) publishes a review protocol over REST, so this is a mapping
// layer, not a backend. A dispatch proposal maps onto a Busabase change_request
// (its fields carry the ticket/crew/priority), the human verdict is a review,
// and executing an approved dispatch is a merge. The change-request status maps
// back onto kelly-tickets' proposal statuses so the resolution board renders
// identically to local mode.
//
// Planning-side writes (ingest / triage merge / execution-report authoring) are
// local-only: they are deterministic merges the agent runs against the JSON
// store before publishing to Busabase. In busabase mode they surface an
// actionable error instead of silently no-op'ing.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_TICKETS_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_TICKETS_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import { readConfig, summarizeConfig } from "../common.ts";
import type {
  AgentTasks,
  ConfigResult,
  ConfigSummary,
  DecisionInput,
  DecisionResult,
  DecisionsFile,
  DispatchProposal,
  ExecutionReport,
  HttpError,
  Lock,
  Onboarding,
  ProviderMeta,
  Snapshot,
  TicketsState,
} from "../types.ts";
import type { TicketsProvider } from "./provider-interface.ts";

const STATUS_MAP: Record<string, DispatchProposal["status"]> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

function localOnly(what: string): HttpError {
  const error: HttpError = new Error(
    `${what} is local-only. Use KELLY_TICKETS_DATA_PROVIDER=local to ingest/triage against the JSON store, then publish proposals to Busabase.`,
  );
  error.statusCode = 400;
  return error;
}

export function createBusabaseProvider(meta: ProviderMeta = {}): TicketsProvider {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_TICKETS_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_TICKETS_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_TICKETS_BUSABASE_API_KEY || ""
    : process.env.KELLY_TICKETS_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_TICKETS_BUSABASE_URL / KELLY_TICKETS_BUSABASE_BASE_ID.",
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

  function primaryOperation(cr) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToProposal(cr): DispatchProposal {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      id: cr.id,
      ref: Number(fields.ref) || 0,
      ticket_id: fields.ticket_id || "",
      title: fields.title || "(untitled dispatch)",
      summary: fields.summary || "",
      proposed_crew_id: fields.proposed_crew_id || "",
      proposed_assignee: fields.proposed_assignee || "",
      priority: fields.priority || "P3",
      sla_due_at: fields.sla_due_at || "",
      sla_hours: Number(fields.sla_hours) || 0,
      reason: fields.reason || "",
      note_to_crew: fields.note_to_crew || "",
      status: STATUS_MAP[cr.status] || "needs_review",
      decision: null,
      execution: cr.status === "merged" ? { status: "executed", operations: [], detail: "", executed_at: "" } : null,
    };
  }

  function countStatuses(proposals: DispatchProposal[]) {
    const needs_review = proposals.filter((p) => p.status === "needs_review").length;
    return {
      intake_count: 0,
      unclassified_intake: 0,
      ticket_count: 0,
      open_tickets: 0,
      resolved_tickets: 0,
      avg_resolution_hours: 0,
      sla_at_risk: 0,
      proposal_count: proposals.length,
      needs_review,
      intake_by_channel: {},
    };
  }

  const provider: TicketsProvider = {
    kind: "busabase",

    configSummary(): ConfigSummary {
      // Reuse the local summary shape so the UI is identical; the remote handles
      // (base_url/base_id/api_key) are echoed by getState().config_summary.
      return summarizeConfig(
        meta.source
          ? { config: meta.config || {}, path: meta.source, is_example: Boolean(meta.is_example) }
          : { config: meta.config || { crews: [] }, path: "", is_example: false },
      );
    },

    async ensureStore() {
      // No local store to create; verify remote config is present instead.
      requireConfig();
    },

    async readConfig(): Promise<ConfigResult> {
      return readConfig();
    },

    async getState(): Promise<TicketsState> {
      const summary = this.configSummary();
      let snapshot: Snapshot;
      try {
        const crs = await api("GET", "/api/v1/change-requests");
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        const dispatch_proposals = list.map(crToProposal);
        snapshot = {
          schema_version: "1",
          generated_at: new Date().toISOString(),
          source: "busabase",
          property: { name: summary.property.name, buildings: summary.property.buildings },
          range: { start: "", end: "" },
          metrics: countStatuses(dispatch_proposals),
          intake: [],
          tickets: [],
          dispatch_proposals,
          crews: [],
          sync_log: [],
          warnings: [],
        };
      } catch (error) {
        snapshot = {
          schema_version: "1",
          generated_at: new Date().toISOString(),
          source: "busabase",
          property: { name: summary.property.name, buildings: summary.property.buildings },
          range: { start: "", end: "" },
          metrics: countStatuses([]),
          intake: [],
          tickets: [],
          dispatch_proposals: [],
          crews: [],
          sync_log: [],
          warnings: [{ id: "busabase-error", severity: "error", message: (error as Error).message }],
        };
      }
      return {
        app: "kelly-tickets",
        data_provider: this.kind,
        onboarding: { completed: true },
        lock: null,
        config_summary: {
          ...summary,
          config_path: `busabase://${baseId || "unconfigured"}`,
        },
        agent_tasks: { updated_at: "", tasks: [] },
        execution_report: null,
        snapshot,
      };
    },

    async submitDecision({ id, action, note }: DecisionInput): Promise<DecisionResult> {
      if (!id) return { ok: false, status: 400, error: "missing id" };
      try {
        if (action === "approve") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
            payload: { verdict: "approved", reason: note || undefined },
          });
        } else if (action === "request_changes") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
            payload: { verdict: "rejected", reason: note || "Please revise" },
          });
        } else if (action === "block") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/close`, {
            reason: note || "Closed by reviewer",
          });
        } else if (action === "revise") {
          const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(id)}`);
          const op = primaryOperation(cr);
          if (!op) return { ok: false, status: 400, error: "change request has no operation to revise" };
          const current = op.headCommit?.fields || {};
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: {
              fields: { ...current, note_to_crew: note || current.note_to_crew },
              message: note || "Saved edits",
              author: "kelly-tickets",
            },
          });
        } else {
          return { ok: false, status: 400, error: `Unknown action for this item: ${action}` };
        }
      } catch (error) {
        return { ok: false, status: 502, error: (error as Error).message };
      }
      return { ok: true };
    },

    async writeExecutionReport(): Promise<void> {
      // Executing an approved dispatch is a Busabase merge.
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      for (const cr of list) {
        if (cr.status === "approved") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/merge`, {});
        }
      }
    },

    async readSnapshot(): Promise<Snapshot> {
      return (await this.getState()).snapshot;
    },

    async readDecisions(): Promise<DecisionsFile> {
      return { updated_at: "", decisions: {} };
    },

    async readAgentTasks(): Promise<AgentTasks> {
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

    async readLock(): Promise<Lock | null> {
      return null;
    },

    async readExecutionReport(): Promise<ExecutionReport | null> {
      return null;
    },

    // ── local-only planning writes ──────────────────────────────────────────
    // Ingest / triage / lock are deterministic merges against the JSON store.
    async writeSnapshot(): Promise<void> {
      throw localOnly("Writing the tickets snapshot (ingest / triage)");
    },

    async writeLock(): Promise<void> {
      throw localOnly("Agent lock");
    },

    async clearLock(): Promise<void> {
      // Nothing to clear remotely; no-op so `finally { clearLock() }` is safe.
    },
  };
  return provider;
}
