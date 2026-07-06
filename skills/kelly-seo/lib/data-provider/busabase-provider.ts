// Busabase SeoDataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the review protocol over REST, so this is a mapping layer,
// not a backend. kelly-seo's unit of review is an SEO opportunity: its fields
// (title/type/target_page/target_query/reason/expected_impact/draft/...) live in
// a Busabase record's commit `fields`; an agent-proposed opportunity is a
// change_request, the human verdict (approve/request_changes/block) is a review,
// a user-edited draft is an operation revision, and executing is a merge. The
// change-request status maps back onto kelly-seo's opportunity workflow statuses
// so the UI renders identically to local mode.
//
// The GSC analytics half of the snapshot (sites/queries/pages/daily) is read-only
// Search Console data with no Busabase equivalent; those arrays come back empty
// here — run KELLY_SEO_DATA_PROVIDER=local to sync analytics, then publish the
// opportunity queue to Busabase.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_SEO_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_SEO_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import { emptySnapshot, summarizeConfig } from "../common.ts";
import type { ProviderMeta, SeoSnapshot } from "../types.ts";

const STATUS_MAP = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const OPPORTUNITY_FIELD_KEYS = [
  "site_id",
  "type",
  "title",
  "target_page",
  "target_query",
  "reason",
  "expected_impact",
  "draft",
  "agent_notes",
];

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_SEO_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_SEO_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_SEO_BUSABASE_API_KEY || ""
    : process.env.KELLY_SEO_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_SEO_BUSABASE_URL / KELLY_SEO_BUSABASE_BASE_ID.",
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

  function pickFields(opportunity) {
    const fields = {};
    for (const key of OPPORTUNITY_FIELD_KEYS) {
      if (opportunity[key] !== undefined) fields[key] = opportunity[key];
    }
    return fields;
  }

  function primaryOperation(cr) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToOpportunity(cr, index) {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    const status = STATUS_MAP[cr.status] || "needs_review";
    return {
      id: cr.id,
      ref: index + 1,
      site_id: fields.site_id || "",
      type: fields.type || "fix_page_issue",
      title: fields.title || "(untitled)",
      target_page: fields.target_page || "",
      target_query: fields.target_query || "",
      reason: fields.reason || "",
      expected_impact: fields.expected_impact || "",
      draft: typeof fields.draft === "string" ? fields.draft : "",
      status,
      agent_notes: fields.agent_notes || "",
      created_at: cr.createdAt || new Date().toISOString(),
      // Busabase-specific handles used by saveDecision:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
      decision: null,
      execution: { status: cr.status === "merged" ? "done" : "pending" },
    };
  }

  function countStatuses(opportunities) {
    const metrics = { needs_review: 0, changes_requested: 0, approved: 0, done: 0, blocked: 0 };
    for (const opportunity of opportunities) {
      if (metrics[opportunity.status] !== undefined) metrics[opportunity.status] += 1;
    }
    return metrics;
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

    async getSnapshot(): Promise<SeoSnapshot> {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      const opportunities = list.map(crToOpportunity);
      const base = emptySnapshot();
      return {
        ...base,
        generated_at: new Date().toISOString(),
        source: "busabase",
        metrics: { ...base.metrics, opportunity_count: opportunities.length },
        opportunities,
        warnings: [],
      };
    },

    async getDecisions() {
      return { updated_at: "", decisions: {} };
    },

    async getExecutionReport() {
      return null;
    },

    async getLock() {
      return null;
    },

    async getAgentTasks() {
      try {
        const tasks = await api("GET", "/api/v1/agent/tasks");
        const list = Array.isArray(tasks) ? tasks : tasks?.items || [];
        return { updated_at: new Date().toISOString(), tasks: list };
      } catch {
        return { updated_at: "", tasks: [] };
      }
    },

    async getOnboarding() {
      return { completed: true };
    },

    async getState() {
      const summary = await this.configSummary();
      try {
        const snapshot = await this.getSnapshot();
        const withCounts = { ...snapshot, opportunity_metrics: countStatuses(snapshot.opportunities) };
        return {
          onboarding: { completed: true },
          lock: null,
          config_summary: summary,
          agent_tasks: await this.getAgentTasks(),
          execution_report: null,
          snapshot: withCounts,
        };
      } catch (error) {
        return {
          onboarding: { completed: true },
          lock: null,
          config_summary: { ...summary, error: (error as Error).message },
          agent_tasks: { updated_at: "", tasks: [] },
          execution_report: null,
          snapshot: emptySnapshot(),
        };
      }
    },

    async saveDecision({ id, action, note, draft }) {
      if (!id) return { ok: false, status: 400, error: "missing id" };
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(id)}`);
      const op = primaryOperation(cr);
      const current = op?.headCommit?.fields || {};
      const nextFields = {
        ...current,
        ...(typeof draft === "string" && draft ? { draft } : {}),
      };
      const edited = typeof draft === "string" && draft && draft !== current.draft;

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-seo" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
          payload: { verdict: "approved", reason: note || undefined },
        });
      } else if (action === "revise") {
        if (!op) return { ok: false, status: 400, error: "change request has no operation to revise" };
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: note || "Saved edits", author: "kelly-seo" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
          payload: { verdict: "rejected", reason: note || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/close`, {
          reason: note || "Closed by reviewer",
        });
      } else {
        return { ok: false, status: 400, error: `Unknown action: ${action}` };
      }
      return { ok: true };
    },

    async getGeoDecisions() {
      // GEO opportunities are not modeled in Busabase yet; verdicts are folded in
      // by the change-request status, so there are no separate GEO decisions.
      return { updated_at: "", decisions: {} };
    },

    async saveGeoDecision() {
      return { ok: false, status: 501, error: "GEO review is local-only; run KELLY_SEO_DATA_PROVIDER=local." };
    },

    async getEntitySignalOverrides() {
      return { updated_at: "", signals: {} };
    },

    async updateEntitySignal() {
      return { ok: false, status: 501, error: "Entity readiness is local-only; run KELLY_SEO_DATA_PROVIDER=local." };
    },

    async writeSnapshot(snapshot: SeoSnapshot) {
      // Publish agent-proposed opportunities as change requests. Analytics data is
      // read-only and not persisted to Busabase.
      for (const opportunity of snapshot.opportunities || []) {
        await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(opportunity),
            message: `SEO opportunity: ${opportunity.title || opportunity.type}`,
            submittedBy: "kelly-seo",
          },
        });
      }
    },

    async writeExecutionReport() {
      // Execution == merge in Busabase; there is no separate report file.
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      for (const cr of list) {
        if (cr.status === "approved") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/merge`, {});
        }
      }
    },

    async acquireLock() {
      // Busabase serializes writes server-side; no local lock file.
      return { owner: "kelly-seo", message: "busabase", started_at: new Date().toISOString() };
    },

    async releaseLock() {
      // no-op
    },
  };
}
