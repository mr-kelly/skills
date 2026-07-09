// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. A creator engagement's fields (handle/name/platform/
// fit_score/...) live in a Busabase record's commit `fields`; an agent-prepared
// engagement is a change_request, the human verdict is a review, an edited draft
// is an operation revision, executing an approved outreach is a merge. The
// change-request status maps back onto kelly-creators' workflow statuses so the
// UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_CREATORS_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_CREATORS_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant Busabase needs no token; a token is only
// required by the cloud/multi-tenant deployment.

import { summarizeConfig } from "../config.ts";
import type { ConfigResult, DecisionBody, ExecuteOptions } from "../types.ts";

// Busabase change-request status -> kelly-creators workflow status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const CREATOR_FIELD_KEYS = [
  "creator_id",
  "ref",
  "handle",
  "name",
  "platform",
  "niche",
  "followers",
  "engagement_rate",
  "fit_score",
  "fit_breakdown",
  "stage",
  "proposed_action",
  "est_rate",
  "risk",
  "channel",
  "reason",
  "audience_note",
  "suggested_reply",
  "est_value",
  "spend",
];

export function createBusabaseProvider(configResult: ConfigResult) {
  const config = configResult.config || {};
  const busa = config.busabase || {};
  const baseUrl = (process.env.KELLY_CREATORS_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_CREATORS_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_CREATORS_BUSABASE_API_KEY || ""
    : process.env.KELLY_CREATORS_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_CREATORS_BUSABASE_URL / KELLY_CREATORS_BUSABASE_BASE_ID.",
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

  function pickFields(creator) {
    const fields = {};
    for (const key of CREATOR_FIELD_KEYS) {
      if (creator[key] !== undefined) fields[key] = creator[key];
    }
    return fields;
  }

  function primaryOperation(cr) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToCreator(cr) {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      item_type: "engagement",
      creator_id: fields.creator_id || cr.id,
      ref: fields.ref ?? String(cr.id).slice(0, 8),
      handle: fields.handle || "",
      name: fields.name || "(unnamed)",
      platform: fields.platform || "",
      niche: fields.niche || "",
      followers: Number(fields.followers || 0),
      engagement_rate: Number(fields.engagement_rate || 0),
      fit_score: Number(fields.fit_score || 0),
      fit_breakdown: fields.fit_breakdown || {},
      stage: fields.stage || "discovery",
      status: STATUS_MAP[cr.status] || "needs_review",
      proposed_action: fields.proposed_action || "no_action",
      est_rate: Number(fields.est_rate || 0),
      risk: Array.isArray(fields.risk) ? fields.risk : [],
      channel: fields.channel || "",
      reason: fields.reason || "",
      audience_note: fields.audience_note || "",
      suggested_reply: fields.suggested_reply || "",
      est_value: Number(fields.est_value || 0),
      spend: Number(fields.spend || 0),
      // Busabase-specific handles:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
    };
  }

  function countMetrics(creators) {
    const doneStatuses = new Set(["approved", "done", "live"]);
    return {
      creator_count: creators.length,
      needs_review: creators.filter((c) => c.status === "needs_review").length,
      approved: creators.filter((c) => c.status === "approved").length,
      done: creators.filter((c) => c.status === "done").length,
      blocked: creators.filter((c) => c.status === "blocked").length,
      total_reach: creators.filter((c) => c.status !== "blocked").reduce((sum, c) => sum + Number(c.followers || 0), 0),
      budget_total: Number(config.program?.budget_total || 0),
      budget_allocated: creators
        .filter((c) => doneStatuses.has(c.status))
        .reduce((sum, c) => sum + Number(c.est_rate || 0), 0),
      est_value: creators.reduce((sum, c) => sum + Number(c.est_value || 0), 0),
    };
  }

  async function listCreators() {
    const crs = await api("GET", "/api/v1/change-requests");
    const list = Array.isArray(crs) ? crs : crs?.items || [];
    return list.map(crToCreator);
  }

  const provider = {
    kind: "busabase",

    configSummary() {
      return {
        ...summarizeConfig(configResult),
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
      };
    },

    async readSnapshot() {
      try {
        const creators = await listCreators();
        return {
          schema_version: "1",
          generated_at: new Date().toISOString(),
          source: "busabase",
          base_currency: config.program?.base_currency || "USD",
          pipeline_stages: ["discovery", "outreach", "negotiating", "live", "measured"],
          metrics: countMetrics(creators),
          creators,
          warnings: [],
        };
      } catch (error) {
        return {
          schema_version: "1",
          generated_at: new Date().toISOString(),
          source: "busabase",
          base_currency: "USD",
          pipeline_stages: ["discovery", "outreach", "negotiating", "live", "measured"],
          metrics: countMetrics([]),
          creators: [],
          warnings: [{ id: "busabase-error", severity: "warning", message: (error as Error).message }],
        };
      }
    },

    async readDecisions() {
      return { updated_at: "", decisions: {} };
    },

    async readAgentTasks() {
      try {
        const tasks = await api("GET", "/api/v1/agent/tasks");
        return { updated_at: new Date().toISOString(), tasks: Array.isArray(tasks) ? tasks : tasks?.items || [] };
      } catch {
        return { updated_at: "", tasks: [] };
      }
    },

    async readExecutionReport() {
      return null;
    },

    async readOnboarding() {
      return { completed: true, source: "busabase" };
    },

    async readLock() {
      return null;
    },

    async getState() {
      const [snapshot, decisions, agentTasks, executionReport, onboarding, lock] = await Promise.all([
        this.readSnapshot(),
        this.readDecisions(),
        this.readAgentTasks(),
        this.readExecutionReport(),
        this.readOnboarding(),
        this.readLock(),
      ]);
      return {
        app: "kelly-creators",
        data_provider: this.kind,
        onboarding,
        lock,
        config_summary: this.configSummary(),
        decisions,
        agent_tasks: agentTasks,
        execution_report: executionReport,
        snapshot,
      };
    },

    async applyDecision(payload: DecisionBody = {}) {
      const creatorId = String(payload.creator_id || "");
      if (!creatorId) throw new Error("creator_id is required");
      const action = String(payload.action || "");
      if (!["approve", "request_changes", "block", "revise"].includes(action)) {
        throw new Error(`Unsupported action: ${action}`);
      }
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(creatorId)}`);
      const op = primaryOperation(cr);
      const current = op?.headCommit?.fields || {};
      const nextFields = { ...current, ...(payload.draft ? { suggested_reply: payload.draft } : {}) };

      if (action === "approve") {
        if (payload.draft && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-creators" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(creatorId)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: payload.comment || "Saved edits", author: "kelly-creators" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(creatorId)}/reviews`, {
          payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(creatorId)}/close`, {
          reason: payload.comment || "Closed by reviewer",
        });
      }
      const now = new Date().toISOString();
      return {
        updated_at: now,
        decisions: { [creatorId]: { action, comment: payload.comment || "", decided_at: now } },
      };
    },

    async writeSnapshot(snapshot) {
      const created = [];
      for (const creator of snapshot.creators || []) {
        const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(creator),
            message: `Engagement for ${creator.handle || creator.creator_id}`,
            submittedBy: "kelly-creators",
          },
        });
        created.push({ creator_id: creator.creator_id, change_request_id: cr?.id || null });
      }
      return { ok: true, created, creator_count: created.length };
    },

    async executeDecisions(options: ExecuteOptions = {}) {
      const apply = Boolean(options.apply);
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      const results = [];
      for (const cr of list) {
        if (cr.status === "approved") {
          if (apply) {
            await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/merge`, {});
          }
          results.push({ creator_id: cr.id, status: apply ? "handed_off" : "dry_run", operation: "merge" });
        } else {
          results.push({ creator_id: cr.id, status: "skipped", operation: "none", reason: `status ${cr.status}` });
        }
      }
      return { dry_run: !apply, results, report_path: `${baseUrl} (base ${baseId})` };
    },
  };

  return provider;
}
