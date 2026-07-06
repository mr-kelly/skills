// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. A campaign send's fields (segment_id, from_identity_id,
// type, subject, status, body) live in a Busabase record's commit `fields`; an
// agent-prepared send is a change_request, the human verdict is a review, an
// edited body is an operation revision, "handing off" (schedule/send) is a
// merge. The change-request status maps back onto kelly-campaigns's send
// workflow statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_CAMPAIGNS_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_CAMPAIGNS_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant apps/busabase needs no token; a token is only
// required by apps/busabase-cloud.

import type { Esp, FromIdentity, ProviderMeta, Segment } from "../types.ts";
import type { DecisionBody } from "../types.ts";

// Busabase change-request status -> kelly-campaigns send workflow status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const SEND_FIELD_KEYS = [
  "type",
  "phase",
  "from_identity_id",
  "subject",
  "preview_text",
  "segment_id",
  "audience_size",
  "status",
  "proposed_action",
  "reason",
  "body",
  "ref",
  "risk",
  "send_at",
];

function summarizeConfig(meta: ProviderMeta) {
  const config = meta.config || {};
  const operator = config.operator || {};
  const brand = config.brand || {};
  const esp: Esp = config.esp || {};
  const policy = config.sending_policy || {};
  const identities: FromIdentity[] = Array.isArray(config.from_identities) ? config.from_identities : [];
  const segments: Segment[] = Array.isArray(config.segments) ? config.segments : [];
  const espSecretKeys = ["api_key_env", "token_env", "password_env"].filter((key) => esp[key]);
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    brand: {
      name: brand.name || "",
      homepage: brand.homepage || "",
      unsubscribe_url: brand.unsubscribe_url || "",
    },
    esp: {
      provider: esp.provider || "",
      display_name: esp.display_name || esp.provider || "",
      secret_envs: espSecretKeys.map((key) => esp[key]),
      secrets_ready: espSecretKeys.length > 0 && espSecretKeys.every((key) => Boolean(process.env[esp[key] as string])),
    },
    from_identities: identities.map((identity) => ({
      identity_id: identity.identity_id || "",
      from_name: identity.from_name || "",
      from_email: identity.from_email || "",
      reply_to: identity.reply_to || "",
      use_when: Array.isArray(identity.use_when) ? identity.use_when : [],
    })),
    segments: segments.map((segment) => ({
      segment_id: segment.segment_id || "",
      name: segment.name || segment.segment_id || "",
      description: segment.description || "",
    })),
    sending_policy: {
      approval_required: policy.approval_required !== false,
      daily_send_cap: Number(policy.daily_send_cap || 0),
      hourly_send_cap: Number(policy.hourly_send_cap || 0),
      min_inbox_readiness: Number(policy.min_inbox_readiness || 0),
      max_spam_score: Number(policy.max_spam_score || 0),
    },
    style_tone: (config.style as { tone?: string } | undefined)?.tone || "",
  };
}

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_CAMPAIGNS_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_CAMPAIGNS_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_CAMPAIGNS_BUSABASE_API_KEY || ""
    : process.env.KELLY_CAMPAIGNS_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_CAMPAIGNS_BUSABASE_URL / KELLY_CAMPAIGNS_BUSABASE_BASE_ID.",
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
    for (const key of SEND_FIELD_KEYS) {
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

  function crToSend(cr: Record<string, unknown>) {
    const op = primaryOperation(cr) || {};
    const headCommit = (op.headCommit as Record<string, unknown>) || {};
    const fields = (headCommit.fields as Record<string, unknown>) || {};
    return {
      send_id: String(cr.id ?? ""),
      ref: typeof fields.ref === "number" ? fields.ref : 0,
      type: (fields.type as string) || "campaign",
      phase: (fields.phase as string) || "deliver",
      from_identity_id: (fields.from_identity_id as string) || "",
      subject: (fields.subject as string) || "",
      preview_text: (fields.preview_text as string) || "",
      segment_id: (fields.segment_id as string) || "",
      audience_size: typeof fields.audience_size === "number" ? fields.audience_size : 0,
      status: STATUS_MAP[cr.status as string] || "needs_review",
      proposed_action: (fields.proposed_action as string) || "schedule_send",
      reason: (fields.reason as string) || "",
      body: (fields.body as string) || "",
      risk: Array.isArray(fields.risk) ? fields.risk : [],
      send_at: (fields.send_at as string) || "",
      subject_variants: [],
      deliverability: { spam_score: 0, inbox_readiness: 0, risk: "low" },
      quality_gate: null,
      // Busabase-specific handles, used by applyDecision:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
    };
  }

  function countStatuses(sends: Array<{ status: string }>) {
    let needsReview = 0;
    let approved = 0;
    let done = 0;
    let blocked = 0;
    for (const send of sends) {
      if (send.status === "needs_review") needsReview += 1;
      if (send.status === "approved") approved += 1;
      if (send.status === "done") done += 1;
      if (send.status === "blocked") blocked += 1;
    }
    return { needs_review: needsReview, approved, done, blocked };
  }

  return {
    kind: "busabase",

    async configSummary() {
      return {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        ...summarizeConfig(meta),
      };
    },

    async getState() {
      const summary = await this.configSummary();
      try {
        const crs = await api("GET", "/api/v1/change-requests");
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        const sends = list.map(crToSend);
        const counts = countStatuses(sends);
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
            list_health: {
              subscriber_count: 0,
              bounce_rate: 0,
              complaint_rate: 0,
              churn_rate: 0,
              avg_open_rate: 0,
              avg_click_rate: 0,
            },
            metrics: {
              needs_review: counts.needs_review,
              approved: counts.approved,
              done: counts.done,
              blocked: counts.blocked,
              scheduled: counts.approved,
              at_risk: 0,
            },
            segments: (summary.segments as unknown[]) || [],
            sends,
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
      const sendId = String(payload.send_id || "");
      const action = String(payload.action || "");
      if (!sendId) throw new Error("send_id is required");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(sendId)}`);
      const op = primaryOperation(cr);
      const headCommit = (op?.headCommit as Record<string, unknown>) || {};
      const current = (headCommit.fields as Record<string, unknown>) || {};
      const nextFields = {
        ...current,
        ...(payload.body !== undefined ? { body: String(payload.body) } : {}),
        ...(payload.chosen_variant !== undefined ? { chosen_variant: String(payload.chosen_variant) } : {}),
      };
      const edited = payload.body !== undefined && payload.body !== current.body;

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id as string)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-campaigns" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(sendId)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id as string)}/revisions`, {
          payload: { fields: nextFields, message: payload.comment || "Saved edits", author: "kelly-campaigns" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(sendId)}/reviews`, {
          payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(sendId)}/close`, {
          reason: payload.comment || "Closed by reviewer",
        });
      } else {
        throw new Error(`Unsupported action: ${action}`);
      }
      return { updated_at: new Date().toISOString(), decisions: { [sendId]: { action } } };
    },

    async writeSnapshot(snapshot: Record<string, unknown>) {
      const created = [];
      for (const send of (snapshot.sends as Array<Record<string, unknown>>) || []) {
        const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(send),
            message: `Send for ${send.segment_id || "segment"}`,
            submittedBy: "kelly-campaigns",
          },
        });
        created.push({ send_id: send.send_id, change_request_id: cr?.id || null });
      }
      return { ok: true, created, count: created.length };
    },

    async writeExecutionReport() {
      // "Scheduling" an approved send is a merge in Busabase; there is no
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
