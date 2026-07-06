// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase (#4437) publishes a review protocol over REST, so this is a mapping
// layer, not a backend. kelly-standup's unit of human review is an
// approval-gated nudge (reminder): the agent drafts it, a human approves,
// requests changes, or blocks it. That maps onto Busabase cleanly:
//
//   reminder draft            -> a change_request whose commit `fields` hold the
//                                nudge (title / draft / channel / member_id / ...)
//   approve                   -> a review with verdict "approved"
//   request_changes / block   -> a review with verdict "rejected" / a close
//   revise (human edits draft) -> an operation revision
//
// The change-request status maps back onto kelly-standup's reminder statuses so
// the board renders identically to local mode. Snapshot ingestion and the
// dry-run execution planner are local-only agent stages (see the throwing
// members below) — plan locally, publish nudges to Busabase.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_STANDUP_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_STANDUP_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import { emptySnapshot, summarizeConfig } from "../common.ts";
import type {
  AgentTask,
  ConfigSummary,
  DecisionInput,
  DecisionResult,
  Decisions,
  ExecutionReport,
  HttpError,
  Lock,
  ProviderMeta,
  Reminder,
  StandupSnapshot,
  StatePayload,
} from "../types.ts";
import type { DataProvider } from "./provider-interface.ts";

// Busabase change-request status -> kelly-standup reminder status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Nudge fields persisted in a Busabase record commit's `fields`:
//   type, member_id, channel, title, reason, draft

export class BusabaseProvider implements DataProvider {
  readonly kind = "busabase";
  private meta: ProviderMeta;
  private baseUrl: string;
  private baseId: string;
  private apiKey: string;

  constructor(meta: ProviderMeta = {}) {
    this.meta = meta;
    const busa = meta.config?.busabase || {};
    this.baseUrl = (process.env.KELLY_STANDUP_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
    this.baseId = process.env.KELLY_STANDUP_BUSABASE_BASE_ID || busa.base_id || "";
    this.apiKey = busa.api_key_env
      ? process.env[busa.api_key_env] || process.env.KELLY_STANDUP_BUSABASE_API_KEY || ""
      : process.env.KELLY_STANDUP_BUSABASE_API_KEY || "";
  }

  private requireConfig() {
    if (!this.baseUrl || !this.baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_STANDUP_BUSABASE_URL / KELLY_STANDUP_BUSABASE_BASE_ID.",
      );
    }
  }

  private async api(method: string, pathname: string, body?: unknown) {
    this.requireConfig();
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
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

  private primaryOperation(cr) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  private crToReminder(cr, index: number): Reminder {
    const op = this.primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      id: cr.id,
      ref: index + 1,
      type: fields.type || "missing_checkin",
      member_id: fields.member_id || "",
      channel: fields.channel || "slack",
      title: fields.title || "(untitled nudge)",
      reason: fields.reason || "",
      draft: typeof fields.draft === "string" ? fields.draft : "",
      status: STATUS_MAP[cr.status] || "needs_review",
      created_at: cr.createdAt || new Date().toISOString(),
      decision: null,
      execution: null,
    };
  }

  configSummary(): ConfigSummary {
    return summarizeConfig(
      this.meta.configResult ?? {
        config: this.meta.config || { members: [] },
        path: this.meta.source || "",
        is_example: this.meta.is_example ?? false,
      },
    );
  }

  async getLock(): Promise<Lock | null> {
    // Busabase serializes writes server-side; there is no local file lock.
    return null;
  }

  async getSnapshot(): Promise<StandupSnapshot> {
    const state = await this.getState();
    return state.snapshot;
  }

  async getDecisions(): Promise<Decisions> {
    // Verdicts live in Busabase reviews, folded into reminder status by getState.
    return { updated_at: "", decisions: {} };
  }

  async getExecutionReport(): Promise<ExecutionReport | null> {
    return null;
  }

  async getState(): Promise<StatePayload> {
    const config_summary = this.configSummary();
    let reminders: Reminder[] = [];
    let warning: string | null = null;
    try {
      const crs = await this.api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      reminders = list.map((cr, index: number) => this.crToReminder(cr, index));
    } catch (error) {
      warning = (error as Error).message;
    }
    const snapshot: StandupSnapshot = {
      ...emptySnapshot(),
      generated_at: new Date().toISOString(),
      source: "busabase",
      reminders,
      warnings: warning ? [{ id: "busabase-unreachable", severity: "warning", message: warning }] : [],
    };
    return {
      app: "kelly-standup",
      data_provider: "busabase",
      onboarding: { completed: true },
      lock: null,
      config_summary,
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
    };
  }

  async saveDecision({ id, action, note, draft }: DecisionInput): Promise<DecisionResult> {
    if (!id) return { ok: false, status: 400, error: "missing id" };
    const cr = await this.api("GET", `/api/v1/change-requests/${encodeURIComponent(id)}`);
    const op = this.primaryOperation(cr);
    const current = op?.headCommit?.fields || {};
    const nextFields = { ...current, ...(typeof draft === "string" && draft ? { draft } : {}) };
    const edited = typeof draft === "string" && draft && draft !== current.draft;

    if (action === "approve") {
      if (edited && op) {
        await this.api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: "Edited nudge before approval", author: "kelly-standup" },
        });
      }
      await this.api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
        payload: { verdict: "approved", reason: note ? String(note) : undefined },
      });
    } else if (action === "revise") {
      if (!op) return { ok: false, status: 400, error: "change request has no operation to revise" };
      await this.api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
        payload: { fields: nextFields, message: note ? String(note) : "Saved nudge edits", author: "kelly-standup" },
      });
    } else if (action === "request_changes") {
      await this.api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
        payload: { verdict: "rejected", reason: note ? String(note) : "Please revise the nudge" },
      });
    } else if (action === "block") {
      await this.api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/close`, {
        reason: note ? String(note) : "Blocked by reviewer",
      });
    } else {
      return { ok: false, status: 400, error: `Unknown action for reminders: ${action}` };
    }
    return { ok: true };
  }

  async listAgentTasks(): Promise<AgentTask[]> {
    try {
      const tasks = await this.api("GET", "/api/v1/agent/tasks");
      return Array.isArray(tasks) ? tasks : tasks?.items || [];
    } catch {
      return [];
    }
  }

  async putSnapshot(): Promise<{ ok: boolean }> {
    const error: HttpError = new Error(
      "Snapshot ingestion is a local-only stage. Use KELLY_STANDUP_DATA_PROVIDER=local to ingest check-ins, then publish nudges to Busabase.",
    );
    error.statusCode = 400;
    throw error;
  }

  async putExecutionReport(): Promise<{ ok: boolean }> {
    const error: HttpError = new Error(
      "The dry-run execution planner is a local-only stage. Approvals are recorded as Busabase reviews; send nudges via kelly-messenger/kelly-email after review.",
    );
    error.statusCode = 400;
    throw error;
  }

  async withLock<T>(_message: string, fn: () => Promise<T>): Promise<T> {
    // Busabase serializes writes server-side; run fn directly.
    return fn();
  }
}

export function createBusabaseProvider(meta: ProviderMeta = {}): BusabaseProvider {
  return new BusabaseProvider(meta);
}
