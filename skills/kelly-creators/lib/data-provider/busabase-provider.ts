// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. A creator engagement's fields (handle, platform,
// channel, niche, reason, status, proposed_action, suggested_reply, est_rate)
// live in a Busabase record's commit `fields`; an agent-prepared engagement is a
// change_request, the human verdict is a review, an edited draft is an operation
// revision, "handing off" (send outreach / brief / contract) is a merge. The
// change-request status maps back onto kelly-creators' workflow statuses so the
// UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_CREATORS_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_CREATORS_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant apps/busabase needs no token; a token is only
// required by apps/busabase-cloud.

import type { Brand, DecisionBody, Platform, ProviderMeta } from "../types.ts";

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
  "handle",
  "name",
  "platform",
  "niche",
  "channel",
  "stage",
  "status",
  "reason",
  "proposed_action",
  "suggested_reply",
  "est_rate",
  "ref",
  "risk",
];

function summarizeConfig(meta: ProviderMeta) {
  const config = meta.config || {};
  const platforms: Platform[] = Array.isArray(config.platforms) ? config.platforms : [];
  const operator = config.operator || {};
  const program = config.program || {};
  const brands: Brand[] = Array.isArray(config.brands) ? config.brands : [];
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    operator: {
      name: operator.name || "",
      role: operator.role || "",
      company: operator.company || "",
      timezone: operator.timezone || "",
    },
    program: {
      base_currency: program.base_currency || "USD",
      budget_total: Number(program.budget_total || 0),
      target_niches: Array.isArray(program.target_niches) ? program.target_niches : [],
    },
    brands: brands.map((brand) => ({
      brand_id: brand.brand_id || "",
      display_name: brand.display_name || brand.brand_id || "",
      positioning: brand.positioning || "",
    })),
    style_tone: config.style?.tone || "",
    platforms: platforms.map((platform) => {
      const secretKeys = ["token_env", "api_key_env", "password_env"].filter((key) => platform[key]);
      return {
        platform_id: platform.platform_id || "",
        type: platform.type || "",
        display_name: platform.display_name || platform.platform_id || "",
        handoff_skill: platform.handoff_skill || "",
        secret_envs: secretKeys.map((key) => platform[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[platform[key] as string])),
      };
    }),
  };
}

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
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

  function pickFields(item: Record<string, unknown>) {
    const fields: Record<string, unknown> = {};
    for (const key of CREATOR_FIELD_KEYS) {
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

  function crToCreator(cr: Record<string, unknown>) {
    const op = primaryOperation(cr) || {};
    const headCommit = (op.headCommit as Record<string, unknown>) || {};
    const fields = (headCommit.fields as Record<string, unknown>) || {};
    return {
      creator_id: String(cr.id ?? ""),
      ref: typeof fields.ref === "number" ? fields.ref : 0,
      handle: (fields.handle as string) || "",
      name: (fields.name as string) || "",
      platform: (fields.platform as string) || "",
      niche: (fields.niche as string) || "",
      channel: (fields.channel as string) || "",
      stage: (fields.stage as string) || "outreach",
      reason: (fields.reason as string) || "",
      proposed_action: (fields.proposed_action as string) || "no_action",
      status: STATUS_MAP[cr.status as string] || "needs_review",
      suggested_reply: (fields.suggested_reply as string) || "",
      est_rate: typeof fields.est_rate === "number" ? fields.est_rate : 0,
      risk: Array.isArray(fields.risk) ? fields.risk : [],
      // Busabase-specific handles, used by applyDecision:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
    };
  }

  function countStatuses(creators: Array<{ status: string }>) {
    let needsReview = 0;
    let approved = 0;
    let done = 0;
    let blocked = 0;
    for (const creator of creators) {
      if (creator.status === "needs_review") needsReview += 1;
      if (creator.status === "approved") approved += 1;
      if (creator.status === "done") done += 1;
      if (creator.status === "blocked") blocked += 1;
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
        const creators = list.map(crToCreator);
        const counts = countStatuses(creators);
        const program = (summary.program as Record<string, unknown>) || {};
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
            base_currency: (program.base_currency as string) || "USD",
            pipeline_stages: ["discovery", "outreach", "negotiating", "live", "measured"],
            metrics: {
              creator_count: creators.length,
              needs_review: counts.needs_review,
              approved: counts.approved,
              done: counts.done,
              blocked: counts.blocked,
              total_reach: 0,
              budget_total: Number(program.budget_total || 0),
              budget_allocated: 0,
              est_value: 0,
            },
            creators,
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
      const creatorId = String(payload.creator_id || "");
      const action = String(payload.action || "");
      if (!creatorId) throw new Error("creator_id is required");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(creatorId)}`);
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
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-creators" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(creatorId)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id as string)}/revisions`, {
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
      } else {
        throw new Error(`Unsupported action: ${action}`);
      }
      return { updated_at: new Date().toISOString(), decisions: { [creatorId]: { action } } };
    },

    async writeSnapshot(snapshot: Record<string, unknown>) {
      const created = [];
      for (const creator of (snapshot.creators as Array<Record<string, unknown>>) || []) {
        const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(creator),
            message: `Engagement for ${creator.handle || creator.name || "creator"}`,
            submittedBy: "kelly-creators",
          },
        });
        created.push({ creator_id: creator.creator_id, change_request_id: cr?.id || null });
      }
      return { ok: true, created, count: created.length };
    },

    async writeExecutionReport() {
      // "Handing off" an approved engagement is a merge in Busabase; there is no
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
