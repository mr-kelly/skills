// Busabase InquiryProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the review protocol over REST, so this is a mapping layer,
// not a backend. kelly-inquiry's approval queue maps cleanly: an agent-suggested
// reply/quote is a change_request, the human verdict is a review, publishing is a
// merge. Inquiry/quote/product context is read from the base's records. The
// change-request status maps back onto kelly-inquiry's approval statuses so the
// UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_INQUIRY_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_INQUIRY_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud` (env KELLY_INQUIRY_BUSABASE_API_KEY).

import type { Approval, HttpError, Inquiry, InquirySnapshot, Lock, ProviderMeta, Quote } from "../types.ts";
import type {
  DecideApprovalInput,
  InquiryProvider,
  QueueReplyInput,
  SetFollowUpInput,
  UpdateQuoteInput,
} from "./provider-interface.ts";
import { emptyMetrics, summarizeConfig } from "./store-core.ts";

// Busabase change-request status -> kelly-inquiry approval status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Approval fields that live in a Busabase record commit's `fields`.
const APPROVAL_FIELD_KEYS = [
  "kind",
  "inquiry_id",
  "quote_id",
  "account_id",
  "channel",
  "customer",
  "text",
  "note",
  "reason",
  "suggested_by",
];

function localOnly(what: string): HttpError {
  const error: HttpError = new Error(
    `${what} is local-only. Use KELLY_INQUIRY_DATA_PROVIDER=local for snapshot ingest / edits, then publish approvals to Busabase.`,
  );
  error.statusCode = 400;
  return error;
}

export function createBusabaseProvider(meta: ProviderMeta): InquiryProvider {
  const busa = meta.configResult.config.busabase || {};
  const baseUrl = (process.env.KELLY_INQUIRY_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_INQUIRY_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_INQUIRY_BUSABASE_API_KEY || ""
    : process.env.KELLY_INQUIRY_BUSABASE_API_KEY || "";

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_INQUIRY_BUSABASE_URL / KELLY_INQUIRY_BUSABASE_BASE_ID.",
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

  function crToApproval(cr: Record<string, any>): Approval {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      item_id: cr.id,
      ref: Number(cr.number) || 0,
      kind: fields.kind || "reply",
      inquiry_id: fields.inquiry_id || "",
      quote_id: fields.quote_id || "",
      account_id: fields.account_id || "",
      channel: fields.channel || "whatsapp",
      customer: fields.customer || "",
      text: typeof fields.text === "string" ? fields.text : "",
      note: fields.note || "",
      reason: fields.reason || "",
      suggested_by: fields.suggested_by || "agent",
      status: STATUS_MAP[cr.status] || "needs_review",
      decision: null,
      execution: cr.status === "merged" ? { status: "done", operation: "merge" } : null,
      created_at: cr.createdAt || new Date().toISOString(),
      updated_at: cr.updatedAt || cr.createdAt || new Date().toISOString(),
    };
  }

  function pickFields(item: QueueReplyInput & Record<string, unknown>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    for (const key of APPROVAL_FIELD_KEYS) {
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

    async readSnapshot(): Promise<InquirySnapshot> {
      const list = await listChangeRequests();
      const approvals = list.map(crToApproval);
      const snapshot: InquirySnapshot = {
        schema_version: "1",
        generated_at: new Date().toISOString(),
        source: "busabase",
        base_currency: "USD",
        metrics: emptyMetrics(),
        accounts: [],
        inquiries: [],
        quotes: [],
        products: [],
        approvals,
        sync_log: [],
        warnings: [],
      };
      snapshot.metrics.account_count = 0;
      return snapshot;
    },

    async writeSnapshot(): Promise<void> {
      // Snapshot ingest (inquiries/products) is local-only; Busabase records are
      // created via queueReply -> change_request. Persisting a whole snapshot has
      // no remote equivalent, so this is a no-op rather than a silent overwrite.
      throw localOnly("Persisting a full inquiry snapshot");
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

    async queueReply(input: QueueReplyInput): Promise<Approval> {
      const cr = (await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
        payload: {
          fields: pickFields({ kind: "reply", suggested_by: "human", ...input }),
          message: `Reply for inquiry ${input.inquiry_id}`,
          submittedBy: "kelly-inquiry",
        },
      })) as Record<string, any>;
      return crToApproval(cr);
    },

    async decideApproval({ item_id, action, comment = "", text }: DecideApprovalInput): Promise<Approval> {
      const cr = (await api("GET", `/api/v1/change-requests/${encodeURIComponent(item_id)}`)) as Record<string, any>;
      const op = primaryOperation(cr);
      const current = op?.headCommit?.fields || {};
      const nextFields = { ...current, ...(text ? { text } : {}) };
      const edited = typeof text === "string" && text.trim() && text !== current.text;

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-inquiry" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(item_id)}/reviews`, {
          payload: { verdict: "approved", reason: comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: comment || "Saved edits", author: "kelly-inquiry" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(item_id)}/reviews`, {
          payload: { verdict: "rejected", reason: comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(item_id)}/close`, {
          reason: comment || "Closed by reviewer",
        });
      } else {
        const error: HttpError = new Error(`Unknown action: ${action}`);
        error.statusCode = 400;
        throw error;
      }
      const fresh = (await api("GET", `/api/v1/change-requests/${encodeURIComponent(item_id)}`)) as Record<string, any>;
      return crToApproval(fresh);
    },

    async setFollowUp(_input: SetFollowUpInput): Promise<Inquiry> {
      throw localOnly("Setting an inquiry follow-up date");
    },

    async updateQuote(_input: UpdateQuoteInput): Promise<Quote> {
      throw localOnly("Editing quote lines / terms");
    },
  };
}
