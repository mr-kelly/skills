// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. A CRM follow-up's fields (contact_id, channel_type,
// reason, suggested_reply, status) live in a Busabase record's commit `fields`;
// an agent-prepared follow-up is a change_request, the human verdict is a
// review, an edited draft is an operation revision, "handing off" (send) is a
// merge. The change-request status maps back onto kelly-crm's follow-up workflow
// statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_CRM_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_CRM_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant apps/busabase needs no token; a token is only
// required by apps/busabase-cloud.

import type { Channel, DecisionBody, ProviderMeta } from "../types.ts";

// Busabase change-request status -> kelly-crm follow-up workflow status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const FOLLOWUP_FIELD_KEYS = [
  "contact_id",
  "deal_id",
  "channel_id",
  "channel_type",
  "reason",
  "status",
  "suggested_reply",
  "ref",
  "risk",
];

function summarizeChannels(meta: ProviderMeta) {
  const config = meta.config || {};
  const channels: Channel[] = Array.isArray(config.channels) ? config.channels : [];
  const operator = config.operator || {};
  const pipeline = config.pipeline || {};
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    pipeline_stages: Array.isArray(pipeline.stages) ? pipeline.stages : [],
    base_currency: pipeline.base_currency || "USD",
    style_tone: config.style?.tone || "",
    channels: channels.map((channel) => {
      const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => channel[key]);
      return {
        channel_id: channel.channel_id || "",
        type: channel.type || "",
        display_name: channel.display_name || channel.channel_id || "",
        handoff_skill: channel.handoff_skill || "",
        secret_envs: secretKeys.map((key) => channel[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[channel[key] as string])),
      };
    }),
  };
}

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_CRM_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_CRM_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_CRM_BUSABASE_API_KEY || ""
    : process.env.KELLY_CRM_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_CRM_BUSABASE_URL / KELLY_CRM_BUSABASE_BASE_ID.",
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

  function pickFields(item: Record<string, unknown>) {
    const fields: Record<string, unknown> = {};
    for (const key of FOLLOWUP_FIELD_KEYS) {
      if (item[key] !== undefined) fields[key] = item[key];
    }
    return fields;
  }

  function primaryOperation(cr: Record<string, unknown>) {
    return (
      (cr.primaryOperation as Record<string, unknown>) ||
      (Array.isArray(cr.operations) ? (cr.operations[0] as Record<string, unknown>) : null)
    );
  }

  function crToFollowup(cr: Record<string, unknown>) {
    const op = primaryOperation(cr) || {};
    const headCommit = (op.headCommit as Record<string, unknown>) || {};
    const fields = (headCommit.fields as Record<string, unknown>) || {};
    return {
      followup_id: String(cr.id ?? ""),
      ref: typeof fields.ref === "number" ? fields.ref : 0,
      contact_id: (fields.contact_id as string) || "",
      deal_id: (fields.deal_id as string) || undefined,
      channel_id: (fields.channel_id as string) || "",
      channel_type: (fields.channel_type as string) || "email",
      reason: (fields.reason as string) || "",
      status: STATUS_MAP[cr.status as string] || "needs_review",
      suggested_reply: (fields.suggested_reply as string) || "",
      risk: Array.isArray(fields.risk) ? fields.risk : [],
      // Busabase-specific handles, used by applyDecision:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
    };
  }

  function countStatuses(followups: Array<{ status: string }>) {
    let needsReview = 0;
    let due = 0;
    for (const followup of followups) {
      if (followup.status === "needs_review") needsReview += 1;
      if (followup.status === "needs_review" || followup.status === "changes_requested") due += 1;
    }
    return { needs_review: needsReview, due };
  }

  return {
    kind: "busabase",

    async configSummary() {
      return {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        ...summarizeChannels(meta),
      };
    },

    async getState() {
      const summary = await this.configSummary();
      try {
        const crs = await api("GET", "/api/v1/change-requests");
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        const followups = list.map(crToFollowup);
        const counts = countStatuses(followups);
        return {
          data_provider: "busabase",
          onboarding: { completed: true },
          lock: null,
          config_summary: summary,
          decisions: { updated_at: "", decisions: {} },
          agent_tasks: { updated_at: "", tasks: [] },
          execution_report: null,
          snapshot: {
            schema_version: "1",
            generated_at: new Date().toISOString(),
            source: "busabase",
            base_currency: (summary.base_currency as string) || "USD",
            pipeline_stages: summary.pipeline_stages || [],
            metrics: {
              contact_count: 0,
              company_count: 0,
              deal_count: 0,
              open_deal_count: 0,
              pipeline_value: 0,
              weighted_pipeline_value: 0,
              followups_needs_review: counts.needs_review,
              followups_due: counts.due,
            },
            companies: [],
            contacts: [],
            deals: [],
            interactions: [],
            followups,
            warnings: [],
          },
        };
      } catch (error) {
        return {
          data_provider: "busabase",
          onboarding: { completed: true },
          lock: null,
          config_summary: { ...summary, error: (error as Error).message },
          decisions: { updated_at: "", decisions: {} },
          agent_tasks: { updated_at: "", tasks: [] },
          execution_report: null,
          snapshot: null,
        };
      }
    },

    async readLock() {
      return null;
    },

    async readSnapshot() {
      const state = await this.getState();
      return (state.snapshot as Record<string, unknown>) || {};
    },

    async readDecisions() {
      return { updated_at: "", decisions: {} };
    },

    async readAgentTasks() {
      try {
        const tasks = await api("GET", "/api/v1/agent/tasks");
        return { updated_at: "", tasks: Array.isArray(tasks) ? tasks : tasks?.items || [] };
      } catch {
        return { updated_at: "", tasks: [] };
      }
    },

    async readExecutionReport() {
      return null;
    },

    async readOnboarding() {
      return { completed: true };
    },

    async applyDecision(payload: DecisionBody = {}) {
      const followupId = String(payload.followup_id || "");
      const action = String(payload.action || "");
      if (!followupId) throw new Error("followup_id is required");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(followupId)}`);
      const op = primaryOperation(cr);
      const headCommit = (op?.headCommit as Record<string, unknown>) || {};
      const current = (headCommit.fields as Record<string, unknown>) || {};
      const nextFields = {
        ...current,
        ...(payload.draft !== undefined ? { suggested_reply: String(payload.draft) } : {}),
      };
      const edited = payload.draft !== undefined && payload.draft !== current.suggested_reply;

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id as string)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-crm" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(followupId)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id as string)}/revisions`, {
          payload: { fields: nextFields, message: payload.comment || "Saved edits", author: "kelly-crm" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(followupId)}/reviews`, {
          payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(followupId)}/close`, {
          reason: payload.comment || "Closed by reviewer",
        });
      } else {
        throw new Error(`Unsupported action: ${action}`);
      }
      return { updated_at: new Date().toISOString(), decisions: { [followupId]: { action } } };
    },

    async writeSnapshot(snapshot: Record<string, unknown>) {
      const created = [];
      for (const followup of (snapshot.followups as Array<Record<string, unknown>>) || []) {
        const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(followup),
            message: `Follow-up for ${followup.contact_id || "contact"}`,
            submittedBy: "kelly-crm",
          },
        });
        created.push({ followup_id: followup.followup_id, change_request_id: cr?.id || null });
      }
      return { ok: true, created, count: created.length };
    },

    async writeExecutionReport() {
      // "Handing off" an approved follow-up is a merge in Busabase; there is no
      // separate execution-report file. Merge all approved change requests.
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      const merged = [];
      for (const cr of list) {
        if (cr.status === "approved") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/merge`, {});
          merged.push({ id: cr.id });
        }
      }
      return { ok: true, merged, count: merged.length };
    },
  };
}
