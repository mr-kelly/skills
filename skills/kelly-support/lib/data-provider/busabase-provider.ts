// Busabase SupportProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the review protocol over REST, so this is a mapping layer,
// not a backend. kelly-support's approval queue maps cleanly: an agent-drafted
// reply / proposed action is a change_request, the human verdict is a review,
// publishing (send/execute) is a merge. Ticket/KB context is read from the base's
// records. The change-request status maps back onto kelly-support's ticket
// statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_SUPPORT_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_SUPPORT_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud` (env KELLY_SUPPORT_BUSABASE_API_KEY).

import type { HttpError, Lock, ProviderMeta, SupportSnapshot, Ticket } from "../types.ts";
import type {
  DecideApprovalInput,
  QueueReplyInput,
  SetSlaInput,
  SupportProvider,
  UpdateTicketInput,
} from "./provider-interface.ts";
import { emptyMetrics, runQualityGate, summarizeConfig } from "./store-core.ts";

// Busabase change-request status -> kelly-support ticket status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Ticket fields that live in a Busabase record commit's `fields`.
const TICKET_FIELD_KEYS = [
  "channel",
  "account_id",
  "customer",
  "subject",
  "body",
  "category",
  "priority",
  "proposed_action",
  "suggested_reply",
  "kb_refs",
  "reason",
  "suggested_by",
];

function localOnly(what: string): HttpError {
  const error: HttpError = new Error(
    `${what} is local-only. Use KELLY_SUPPORT_DATA_PROVIDER=local for snapshot ingest / edits, then publish tickets to Busabase.`,
  );
  error.statusCode = 400;
  return error;
}

export function createBusabaseProvider(meta: ProviderMeta): SupportProvider {
  const busa = meta.configResult.config.busabase || {};
  const baseUrl = (process.env.KELLY_SUPPORT_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_SUPPORT_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_SUPPORT_BUSABASE_API_KEY || ""
    : process.env.KELLY_SUPPORT_BUSABASE_API_KEY || "";

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_SUPPORT_BUSABASE_URL / KELLY_SUPPORT_BUSABASE_BASE_ID.",
      );
    }
  }

  async function api(method: string, pathname: string, body?: unknown): Promise<unknown> {
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

  function primaryOperation(cr: Record<string, any>): Record<string, any> | null {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToTicket(cr: Record<string, any>): Ticket {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    const now = cr.updatedAt || cr.createdAt || new Date().toISOString();
    return {
      ticket_id: cr.id,
      ref: Number(cr.number) || 0,
      account_id: fields.account_id || "",
      channel: fields.channel || "email",
      customer: typeof fields.customer === "object" ? fields.customer : { name: String(fields.customer || "Customer") },
      subject: fields.subject || "",
      body: fields.body || "",
      category: fields.category || "how_to",
      priority: fields.priority || "normal",
      status: STATUS_MAP[cr.status] || "needs_review",
      proposed_action: fields.proposed_action || "send_reply",
      reason: fields.reason || "",
      suggested_reply: typeof fields.suggested_reply === "string" ? fields.suggested_reply : "",
      kb_refs: Array.isArray(fields.kb_refs) ? fields.kb_refs : [],
      sla: { policy: "busabase", due_by: fields.sla_due_by || "", breached: false },
      csat: null,
      quality_gate: fields.quality_gate || null,
      owner: fields.owner || "Kelly",
      unread: false,
      created_at: cr.createdAt || now,
      last_message_at: now,
      decision: null,
      execution: cr.status === "merged" ? { status: "done", operation: "send_reply" } : null,
      messages: Array.isArray(fields.messages) ? fields.messages : [],
      updated_at: now,
    };
  }

  function pickFields(item: QueueReplyInput & Record<string, unknown>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    for (const key of TICKET_FIELD_KEYS) {
      if (item[key] !== undefined) fields[key] = item[key];
    }
    return fields;
  }

  const configSummary = () => ({
    ...summarizeConfig(meta.configResult),
    provider: "busabase",
    base_url: baseUrl || null,
    base_id: baseId || null,
    api_key: apiKey ? "configured" : "none",
  });

  async function listChangeRequests(): Promise<Record<string, any>[]> {
    const crs = (await api("GET", "/api/v1/change-requests")) as any;
    return Array.isArray(crs) ? crs : crs?.items || [];
  }

  return {
    kind: "busabase",

    configSummary,

    async readLock(): Promise<Lock | null> {
      return null;
    },

    async readSnapshot(): Promise<SupportSnapshot> {
      const list = await listChangeRequests();
      const tickets = list.map(crToTicket);
      const snapshot: SupportSnapshot = {
        schema_version: "1",
        generated_at: new Date().toISOString(),
        source: "busabase",
        metrics: emptyMetrics(),
        accounts: [],
        tickets,
        knowledge_base: [],
        sync_log: [],
        warnings: [],
      };
      snapshot.metrics.ticket_count = tickets.length;
      return snapshot;
    },

    async writeSnapshot(): Promise<void> {
      // Snapshot ingest (tickets / KB) is local-only; Busabase records are created
      // via queueReply -> change_request. Persisting a whole snapshot has no remote
      // equivalent, so this throws rather than silently overwriting.
      throw localOnly("Persisting a full support snapshot");
    },

    async getState() {
      const summary = configSummary();
      try {
        const snapshot = await this.readSnapshot();
        return {
          data_provider: "busabase",
          onboarding: { completed: true, config_version: "busabase" },
          lock: null,
          config_summary: summary,
          snapshot,
          decisions: { schema_version: "1", updated_at: new Date().toISOString(), decisions: {} },
          agent_tasks: { schema_version: "1", updated_at: "", tasks: [] },
          execution_report: null,
        };
      } catch (error) {
        return {
          data_provider: "busabase",
          onboarding: { completed: false },
          lock: null,
          config_summary: { ...summary, error: (error as Error).message },
          snapshot: null,
          decisions: { schema_version: "1", updated_at: "", decisions: {} },
          agent_tasks: { schema_version: "1", updated_at: "", tasks: [] },
          execution_report: null,
        };
      }
    },

    async queueReply(input: QueueReplyInput): Promise<Ticket> {
      const cr = (await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
        payload: {
          fields: pickFields({ suggested_by: "human", ...input }),
          message: `Reply for ticket ${input.ticket_id}`,
          submittedBy: "kelly-support",
        },
      })) as Record<string, any>;
      return crToTicket(cr);
    },

    async decideApproval({ ticket_id, action, comment = "", text }: DecideApprovalInput): Promise<Ticket> {
      const cr = (await api("GET", `/api/v1/change-requests/${encodeURIComponent(ticket_id)}`)) as Record<string, any>;
      const op = primaryOperation(cr);
      const current = op?.headCommit?.fields || {};
      const nextFields = { ...current, ...(text ? { suggested_reply: text } : {}) };
      const edited = typeof text === "string" && text.trim() && text !== current.suggested_reply;

      if (action === "approve") {
        // Safety: never let an approve stick on a gate BLOCK, same guarantee the
        // local provider enforces. Gate the effective (possibly just-edited) reply.
        const candidate = crToTicket(cr);
        if (typeof text === "string" && text.trim()) candidate.suggested_reply = text.trim();
        const gate = runQualityGate(candidate, [], meta.configResult.config.risk_policy || {});
        if (gate.verdict === "block") {
          const error: HttpError = new Error(
            "support-qa gate is BLOCK: this reply promises a refund/commitment without approval or is ungrounded. Fix the reply before approving.",
          );
          error.statusCode = 409;
          throw error;
        }
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-support" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(ticket_id)}/reviews`, {
          payload: { verdict: "approved", reason: comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: comment || "Saved edits", author: "kelly-support" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(ticket_id)}/reviews`, {
          payload: { verdict: "rejected", reason: comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(ticket_id)}/close`, {
          reason: comment || "Closed by reviewer",
        });
      } else {
        const error: HttpError = new Error(`Unknown action: ${action}`);
        error.statusCode = 400;
        throw error;
      }
      const fresh = (await api("GET", `/api/v1/change-requests/${encodeURIComponent(ticket_id)}`)) as Record<
        string,
        any
      >;
      return crToTicket(fresh);
    },

    async setSla(_input: SetSlaInput): Promise<Ticket> {
      throw localOnly("Rescheduling a ticket SLA");
    },

    async updateTicket(_input: UpdateTicketInput): Promise<Ticket> {
      throw localOnly("Editing ticket priority / proposed action");
    },
  };
}
