// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the review protocol over REST, so this is a mapping layer,
// not a backend. A send's fields (subject/body/segment_id/...) live in a Busabase
// record's commit `fields`; an agent draft is a change_request, the human verdict
// is a review, publishing is a merge. The change-request status maps back onto
// kelly-campaigns' workflow statuses so the UI is identical to local mode.
//
// Consent/suppression maps to a Busabase suppression collection
// (GET/POST /api/v1/bases/:base/suppression), evaluated identically to the local
// provider so the pre-send gate behaves the same on either backend.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_CAMPAIGNS_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_CAMPAIGNS_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)

import type { DecisionBody, ProviderMeta, SuppressionEntry } from "../types.ts";
import { summarizeConfig } from "./config.ts";
import { checkSuppression } from "./local-file-provider.ts";
import type { SuppressionCheck } from "./provider-interface.ts";

const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const SEND_FIELD_KEYS = [
  "subject",
  "preview_text",
  "body",
  "type",
  "phase",
  "segment_id",
  "audience_size",
  "from_identity_id",
  "proposed_action",
  "send_at",
  "reason",
];

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = (meta.config?.busabase || {}) as Record<string, string>;
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

  function primaryOperation(cr: Record<string, unknown>) {
    return (
      (cr.primaryOperation as Record<string, unknown>) ||
      (Array.isArray(cr.operations) ? (cr.operations[0] as Record<string, unknown>) : null)
    );
  }

  function crToSend(cr: Record<string, unknown>) {
    const op = primaryOperation(cr) || {};
    const fields = ((op.headCommit as Record<string, unknown>)?.fields as Record<string, unknown>) || {};
    return {
      send_id: cr.id,
      ref: cr.number || String(cr.id).slice(0, 8),
      type: fields.type || "campaign",
      phase: fields.phase || "deliver",
      from_identity_id: fields.from_identity_id || "",
      subject: fields.subject || "(untitled)",
      preview_text: fields.preview_text || "",
      segment_id: fields.segment_id || "",
      audience_size: Number(fields.audience_size || 0),
      status: STATUS_MAP[String(cr.status)] || "needs_review",
      proposed_action: fields.proposed_action || "hold",
      risk: Array.isArray(fields.risk) ? fields.risk : [],
      send_at: fields.send_at || "",
      reason: fields.reason || "",
      body: typeof fields.body === "string" ? fields.body : "",
      deliverability: fields.deliverability || {},
      subject_variants: Array.isArray(fields.subject_variants) ? fields.subject_variants : [],
      quality_gate: fields.quality_gate || null,
      performance: fields.performance || null,
      operation_id: op.id || null,
      busabase_status: cr.status,
    };
  }

  function pickFields(send: Record<string, unknown>) {
    const fields: Record<string, unknown> = {};
    for (const key of SEND_FIELD_KEYS) {
      if (send[key] !== undefined) fields[key] = send[key];
    }
    return fields;
  }

  function countMetrics(sends: { status: string }[]) {
    const metrics = { needs_review: 0, approved: 0, done: 0, blocked: 0, scheduled: 0, at_risk: 0 };
    for (const send of sends) {
      if (metrics[send.status as keyof typeof metrics] !== undefined) metrics[send.status as keyof typeof metrics] += 1;
      if (send.status === "approved") metrics.scheduled += 1;
    }
    return metrics;
  }

  async function fetchSuppression(): Promise<SuppressionEntry[]> {
    const raw = await api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}/suppression`);
    const list = Array.isArray(raw) ? raw : raw?.entries || raw?.items || [];
    return (list as Record<string, unknown>[]).map((entry) => ({
      address: entry.address ? String(entry.address) : undefined,
      segment_id: entry.segment_id ? String(entry.segment_id) : undefined,
      reason: String(entry.reason || "unsubscribe"),
      note: entry.note ? String(entry.note) : undefined,
      suppressed_at: String(entry.suppressed_at || entry.createdAt || ""),
      source: entry.source ? String(entry.source) : "busabase",
    }));
  }

  return {
    name: "busabase",

    async getConfigSummary() {
      return {
        ...summarizeConfig(meta),
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
      };
    },

    async getLock() {
      return null;
    },

    async getAgentTasks() {
      try {
        const tasks = await api("GET", "/api/v1/agent/tasks");
        return { updated_at: new Date().toISOString(), tasks: Array.isArray(tasks) ? tasks : tasks?.items || [] };
      } catch {
        return { updated_at: "", tasks: [] };
      }
    },

    async getSuppression() {
      try {
        const entries = await fetchSuppression();
        return { updated_at: new Date().toISOString(), entries };
      } catch (error) {
        return { updated_at: "", entries: [], error: (error as Error).message };
      }
    },

    async evaluateSuppression(send: Record<string, unknown>): Promise<SuppressionCheck> {
      let entries: SuppressionEntry[] = [];
      try {
        entries = await fetchSuppression();
      } catch {
        entries = [];
      }
      return checkSuppression(send, entries);
    },

    async getState() {
      const summary = await this.getConfigSummary();
      try {
        const crs = await api("GET", "/api/v1/change-requests");
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        const sends = (list as Record<string, unknown>[]).map(crToSend);
        const [suppression, agentTasks] = await Promise.all([this.getSuppression(), this.getAgentTasks()]);
        return {
          app: "kelly-campaigns",
          data_provider: "busabase",
          onboarding: { completed: true },
          lock: null,
          config_summary: summary,
          decisions: { updated_at: "", decisions: {} },
          agent_tasks: agentTasks,
          execution_report: null,
          suppression,
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
            metrics: countMetrics(sends as { status: string }[]),
            segments: [],
            sends,
            warnings: [],
          },
        };
      } catch (error) {
        return {
          app: "kelly-campaigns",
          data_provider: "busabase",
          onboarding: { completed: true },
          lock: null,
          config_summary: { ...summary, error: (error as Error).message },
          decisions: { updated_at: "", decisions: {} },
          agent_tasks: { updated_at: "", tasks: [] },
          execution_report: null,
          suppression: { updated_at: "", entries: [] },
          snapshot: null,
        };
      }
    },

    async applyDecision(payload: DecisionBody = {}) {
      const sendId = String(payload.send_id || "");
      if (!sendId) throw new Error("send_id is required");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(sendId)}`);
      const op = primaryOperation(cr);
      const current = ((op?.headCommit as Record<string, unknown>)?.fields as Record<string, unknown>) || {};
      const action = String(payload.action || "revise");
      const nextFields = {
        ...current,
        ...(payload.body ? { body: payload.body } : {}),
      };
      const edited = Boolean(payload.body && payload.body !== current.body);

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(String(op.id))}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-campaigns" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(sendId)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(String(op.id))}/revisions`, {
          payload: { fields: nextFields, message: payload.comment || "Saved edits", author: "kelly-campaigns" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(sendId)}/reviews`, {
          payload: { verdict: "changes_requested", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(sendId)}/close`, {
          reason: payload.comment || "Blocked by reviewer",
        });
      } else {
        throw new Error(`Unsupported action: ${action}`);
      }
      return { ok: true, action };
    },

    // pickFields is used when a script publishes sends into Busabase.
    pickFields,
  };
}
