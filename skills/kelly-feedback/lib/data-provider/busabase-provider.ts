// Busabase ReviewProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. kelly-feedback's reviewable unit is a proposal
// (promote / decline / merge / publish a roadmap decision); its fields live in a
// Busabase record's commit `fields`, an agent-drafted proposal is a
// change_request, the human verdict (approve / request_changes / block) is a
// review, an edited draft is an operation revision, and executing an approved
// proposal is a merge. The change-request status maps back onto kelly-feedback's
// proposal statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_FEEDBACK_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_FEEDBACK_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import { emptyDecisions, emptySnapshot } from "../common.ts";
import type { AgentTasks, Decisions, FeedbackSnapshot, HttpError, Lock, Proposal, ProviderMeta } from "../types.ts";
import type { ReviewProvider, ReviewState } from "./provider-interface.ts";

// Busabase change-request status -> kelly-feedback proposal status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Proposal fields carried on a Busabase record commit.
const PROPOSAL_FIELD_KEYS = [
  "type",
  "title",
  "request_id",
  "request_ids",
  "target_lane",
  "reason",
  "evidence",
  "draft_kind",
  "draft",
];

function localOnly(what: string): HttpError {
  const error: HttpError = new Error(
    `${what} is local-only. Use KELLY_FEEDBACK_DATA_PROVIDER=local to prepare handoff state, then publish to Busabase.`,
  );
  error.statusCode = 400;
  return error;
}

export function createBusabaseProvider(meta: ProviderMeta = {}): ReviewProvider {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_FEEDBACK_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_FEEDBACK_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_FEEDBACK_BUSABASE_API_KEY || ""
    : process.env.KELLY_FEEDBACK_BUSABASE_API_KEY || "";

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_FEEDBACK_BUSABASE_URL / KELLY_FEEDBACK_BUSABASE_BASE_ID.",
      );
    }
  }

  async function api(method: string, pathname: string, body?: unknown): Promise<any> {
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

  function primaryOperation(cr: any): any {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToProposal(cr: any, index: number): Proposal {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      proposal_id: cr.id,
      ref: typeof cr.ref === "number" ? cr.ref : index + 1,
      type: fields.type || "promote_request",
      title: fields.title || "(untitled)",
      status: STATUS_MAP[cr.status] || "needs_review",
      request_id: fields.request_id || "",
      request_ids: Array.isArray(fields.request_ids) ? fields.request_ids : [],
      target_lane: fields.target_lane || "",
      reason: fields.reason || "",
      evidence: fields.evidence || "",
      draft_kind: fields.draft_kind || "",
      draft: typeof fields.draft === "string" ? fields.draft : "",
      review_note: fields.review_note || "",
      created_at: cr.createdAt || "",
      decided_at: cr.status === "merged" ? cr.updatedAt || "" : "",
    };
  }

  function pickFields(proposal: Record<string, any>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    for (const key of PROPOSAL_FIELD_KEYS) {
      if (proposal[key] !== undefined) fields[key] = proposal[key];
    }
    return fields;
  }

  const provider: ReviewProvider = {
    kind: "busabase",

    configSummary() {
      return {
        data_provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        publishing_connectors: "busabase",
      };
    },

    async getState(): Promise<ReviewState> {
      const summary = this.configSummary();
      const snapshot = emptySnapshot();
      snapshot.source = "busabase";
      try {
        const crs = await api("GET", "/api/v1/change-requests");
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        snapshot.proposals = list.map((cr: any, index: number) => crToProposal(cr, index));
        snapshot.metrics.proposals_needs_review = snapshot.proposals.filter((p) => p.status === "needs_review").length;
      } catch (error) {
        summary.error = (error as Error).message;
      }
      return {
        onboarding: { completed: true, config_version: "busabase" },
        lock: null,
        decisions: emptyDecisions(),
        config_summary: summary,
        snapshot,
      };
    },

    async saveDecision(body: Record<string, any>): Promise<Decisions> {
      const id = String(body.id || "");
      const kind = String(body.kind || "");
      if (!id) throw new Error("id is required");
      if (kind !== "proposal") {
        // feedback triage / request sizing are local planning verbs.
        throw localOnly(`decision kind "${kind}"`);
      }
      const action = String(body.action || "");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(id)}`);
      const op = primaryOperation(cr);
      const current = op?.headCommit?.fields || {};
      const draft = typeof body.draft === "string" ? body.draft : current.draft;
      const nextFields = {
        ...current,
        ...(body.review_note ? { review_note: String(body.review_note) } : {}),
        ...(typeof body.draft === "string" ? { draft } : {}),
      };

      if (action === "approve") {
        if (op && typeof body.draft === "string" && body.draft !== current.draft) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-feedback" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
          payload: { verdict: "approved", reason: body.review_note || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: body.review_note || "Saved edits", author: "kelly-feedback" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
          payload: { verdict: "rejected", reason: body.review_note || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/close`, {
          reason: body.review_note || "Closed by reviewer",
        });
      } else {
        throw new Error(`unsupported proposal action: ${action}`);
      }

      const decisions = emptyDecisions();
      decisions.updated_at = new Date().toISOString();
      decisions.proposals[id] = {
        action,
        review_note: String(body.review_note || ""),
        decided_at: decisions.updated_at,
      };
      return decisions;
    },

    async readLock(): Promise<Lock | null> {
      // Busabase serializes writes server-side; there is no local lock file.
      return null;
    },

    async readSnapshot(): Promise<FeedbackSnapshot> {
      return (await this.getState()).snapshot;
    },

    async writeSnapshot(): Promise<void> {
      // Feedback ingest / clustering are local planning stages; publish proposals
      // to Busabase, don't overwrite the base's records wholesale.
      throw localOnly("Writing the feedback snapshot");
    },

    async readDecisions(): Promise<Decisions> {
      return emptyDecisions();
    },

    async readAgentTasks(): Promise<AgentTasks> {
      try {
        const tasks = await api("GET", "/api/v1/agent/tasks");
        const list = Array.isArray(tasks) ? tasks : tasks?.items || [];
        return { schema_version: "1", updated_at: new Date().toISOString(), tasks: list };
      } catch {
        return { schema_version: "1", updated_at: "", tasks: [] };
      }
    },

    async writeAgentTasks(): Promise<void> {
      throw localOnly("Writing the agent task queue");
    },

    async writeExecutionReport(): Promise<void> {
      throw localOnly("Writing the execution report");
    },

    async acquireLock(_message: string): Promise<Lock> {
      return { owner: "busabase", message: "server-serialized (no local lock)", started_at: new Date().toISOString() };
    },

    async releaseLock(): Promise<void> {
      // No local lock to release.
    },
  };

  return provider;
}
