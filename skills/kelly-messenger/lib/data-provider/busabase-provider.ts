// Busabase MessengerProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes a review protocol over REST, so this is a mapping layer,
// not a backend. kelly-messenger's approval-gated outbox maps cleanly onto it:
// a queued reply is a change_request whose commit `fields` hold the reply body
// (text/conversation_id/...), a human verdict is a review, an edit is an
// operation revision, and sending an approved reply is a merge. The
// change-request status maps back onto kelly-messenger's ReplyStatus so the UI
// renders identically to local mode.
//
// The inbox snapshot (collected incoming messages) is read-only here: it is
// hydrated from Busabase records when available and otherwise returned empty.
// Local-only write paths (sync/ingest into the snapshot, lock files) throw with
// a message pointing back to KELLY_MESSENGER_DATA_PROVIDER=local.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_MESSENGER_BUSABASE_URL      e.g. http://127.0.0.1:3000
//   base_id       KELLY_MESSENGER_BUSABASE_BASE_ID  the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type {
  AgentTasks,
  Config,
  ConfigResult,
  ConfigSummary,
  Conversation,
  DecideReplyInput,
  HttpError,
  Lock,
  MessagesSnapshot,
  Onboarding,
  Outbox,
  ProviderMeta,
  QueueReplyInput,
  Reply,
  ReplyStatus,
} from "../types.ts";
import { emptyOutbox, emptySnapshot, readConfig, summarizeConfig } from "./common.ts";

// Busabase change-request status -> kelly-messenger ReplyStatus.
const STATUS_MAP: Record<string, ReplyStatus> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const REPLY_FIELD_KEYS = [
  "conversation_id",
  "account_id",
  "platform",
  "conversation_title",
  "text",
  "note",
  "reason",
  "suggested_by",
];

function localOnly(message: string): HttpError {
  const error: HttpError = new Error(
    `${message} Use KELLY_MESSENGER_DATA_PROVIDER=local for that path, then publish to Busabase.`,
  );
  error.statusCode = 400;
  return error;
}

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const config: Config = meta.config || { accounts: [] };
  const busa = config.busabase || {};
  const baseUrl = (process.env.KELLY_MESSENGER_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_MESSENGER_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_MESSENGER_BUSABASE_API_KEY || ""
    : process.env.KELLY_MESSENGER_BUSABASE_API_KEY || "";

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_MESSENGER_BUSABASE_URL / KELLY_MESSENGER_BUSABASE_BASE_ID.",
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

  function pickFields(reply: Record<string, unknown>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    for (const key of REPLY_FIELD_KEYS) {
      if (reply[key] !== undefined) fields[key] = reply[key];
    }
    return fields;
  }

  function primaryOperation(cr: any): any {
    return cr?.primaryOperation || (Array.isArray(cr?.operations) ? cr.operations[0] : null);
  }

  function crToReply(cr: any, index: number): Reply {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    const now = new Date().toISOString();
    const status = STATUS_MAP[cr.status] || "needs_review";
    return {
      reply_id: String(cr.id),
      ref: index + 1,
      conversation_id: fields.conversation_id || "",
      account_id: fields.account_id || "",
      platform: fields.platform || "",
      conversation_title: fields.conversation_title || "",
      text: typeof fields.text === "string" ? fields.text : "",
      note: fields.note || "",
      reason: fields.reason || "",
      suggested_by: fields.suggested_by || "agent",
      status,
      decision:
        cr.status && cr.status !== "in_review"
          ? { action: cr.status, comment: cr.reviewReason || "", decided_at: cr.updatedAt || now }
          : null,
      execution: status === "done" ? { status: "executed", operation: "merge" } : null,
      created_at: cr.createdAt || now,
      updated_at: cr.updatedAt || now,
    };
  }

  const provider = {
    kind: "busabase",

    config(): Config {
      return config;
    },

    async ensureReady(): Promise<void> {
      requireConfig();
    },

    async readConfig(): Promise<ConfigResult> {
      // Config discovery is filesystem-local in both modes (it selects the
      // provider); the accounts/reply_style block still comes from disk.
      return readConfig();
    },

    async configSummary(): Promise<ConfigSummary> {
      const configResult = await readConfig();
      return {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        ...summarizeConfig(configResult),
      };
    },

    async getState(): Promise<Record<string, unknown>> {
      const [configResult, outbox] = await Promise.all([readConfig(), this.readOutbox().catch(() => emptyOutbox())]);
      const summary: ConfigSummary = {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        ...summarizeConfig(configResult),
      };
      let snapshot: MessagesSnapshot;
      try {
        snapshot = await this.readSnapshot();
      } catch (error) {
        snapshot = emptySnapshot();
        snapshot.warnings.push({
          id: "busabase-snapshot",
          severity: "warning",
          message: "Could not read the message snapshot from Busabase.",
          detail: (error as Error).message,
        });
      }
      return {
        app: "kelly-messenger",
        data_provider: "busabase",
        onboarding: await this.readOnboarding(),
        lock: null,
        config_summary: summary,
        snapshot,
        outbox,
        agent_tasks: await this.readAgentTasks(),
        execution_report: await this.readExecutionReport(),
      };
    },

    async readSnapshot(): Promise<MessagesSnapshot> {
      // Inbox records are read-only in Busabase mode. If the base does not
      // expose a snapshot endpoint, fall back to an empty snapshot.
      try {
        const remote = await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}/records?table=messages_snapshot`);
        if (remote?.snapshot) return remote.snapshot as MessagesSnapshot;
      } catch {
        // fall through to empty
      }
      return emptySnapshot();
    },

    async writeSnapshot(): Promise<void> {
      throw localOnly("The inbox snapshot is collected locally (sync/ingest).");
    },

    mergeConversations(_snapshot: MessagesSnapshot, _incoming: Conversation[] = []): number {
      throw localOnly("Snapshot merging happens during local sync/ingest.");
    },

    recomputeMetrics(snapshot: MessagesSnapshot): MessagesSnapshot {
      return snapshot;
    },

    async readOutbox(): Promise<Outbox> {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      return {
        schema_version: "1",
        updated_at: new Date().toISOString(),
        replies: list.map((cr: any, index: number) => crToReply(cr, index)),
      };
    },

    async writeOutbox(): Promise<void> {
      throw localOnly("The outbox is derived from Busabase change-requests; write through queueReply/decideReply.");
    },

    async queueReply(input: QueueReplyInput): Promise<Reply> {
      if (typeof input.text !== "string" || !input.text.trim()) throw new Error("Reply text must not be empty");
      const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
        payload: {
          fields: pickFields({
            conversation_id: input.conversation_id,
            text: input.text.trim(),
            note: input.note || "",
            suggested_by: input.suggested_by || "human",
            reason: "Queued from the inbox composer.",
          }),
          message: `Reply draft for ${input.conversation_id}`,
          submittedBy: "kelly-messenger",
        },
      });
      return crToReply(cr, 0);
    },

    async decideReply({ reply_id, action, comment = "", text }: DecideReplyInput): Promise<Reply> {
      if (!reply_id) throw new Error("Unknown reply: (missing reply_id)");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(reply_id)}`);
      const op = primaryOperation(cr);
      const current = op?.headCommit?.fields || {};
      const nextFields = { ...current, ...(text?.trim() ? { text: text.trim() } : {}) };
      const edited = Boolean(text?.trim() && text.trim() !== current.text);

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-messenger" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reply_id)}/reviews`, {
          payload: { verdict: "approved", reason: comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: comment || "Saved edits", author: "kelly-messenger" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reply_id)}/reviews`, {
          payload: { verdict: "changes_requested", reason: comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(reply_id)}/close`, {
          reason: comment || "Blocked by reviewer",
        });
      } else {
        throw new Error(`Unknown action: ${action}`);
      }
      const updated = await api("GET", `/api/v1/change-requests/${encodeURIComponent(reply_id)}`);
      return crToReply(updated, 0);
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
      throw localOnly("Agent tasks are derived from Busabase change-request reviews.");
    },

    async readLock(): Promise<Lock | null> {
      // Busabase serializes writes server-side; there is no local lock file.
      return null;
    },

    async writeLock(): Promise<void> {
      throw localOnly("The agent lock is a local-file coordination primitive.");
    },

    async clearLock(): Promise<void> {
      // No-op: no local lock in Busabase mode.
    },

    async readOnboarding(): Promise<Onboarding> {
      return { completed: true, config_version: "busabase" };
    },

    async readExecutionReport(): Promise<unknown> {
      return null;
    },

    async writeExecutionReport(): Promise<void> {
      // Sends are merges in Busabase mode; there is no separate report file.
    },
  };

  return provider;
}
