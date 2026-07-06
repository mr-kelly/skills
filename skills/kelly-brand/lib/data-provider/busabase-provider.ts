// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. A brand narrative asset's fields (type, phase, title,
// draft, status, risk, ref) live in a Busabase record's commit `fields`; an
// agent-drafted narrative asset is a change_request, the human verdict
// (adopt-as-canonical) is a review, an edited draft is an operation revision,
// promoting to the canonical narrative is a merge. The change-request status
// maps back onto kelly-brand's narrative workflow statuses so the UI is
// identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_BRAND_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_BRAND_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant apps/busabase needs no token; a token is only
// required by apps/busabase-cloud.

import type { Channel, DecisionBody, ProviderMeta } from "../types.ts";

// Busabase change-request status -> kelly-brand narrative workflow status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const ITEM_FIELD_KEYS = ["type", "phase", "sub_skill", "title", "draft", "status", "ref", "risk"];

function summarizeChannels(meta: ProviderMeta) {
  const config = meta.config || {};
  const channels: Channel[] = Array.isArray(config.channels) ? config.channels : [];
  const brand = config.brand || {};
  const style = config.style || {};
  const officialUrls = config.official_urls || {};
  const riskPolicy = config.risk_policy || {};
  return {
    config_path: meta.source || "",
    is_example: Boolean(meta.is_example),
    brand: {
      name: brand.name || "",
      category: brand.category || "",
      audience: brand.audience || "",
      mission: brand.mission || "",
      framework: brand.framework || "TALE",
    },
    style_tone: style.tone || "",
    reading_level: style.reading_level || "",
    official_urls: Object.entries(officialUrls).map(([key, value]) => ({ key, url: String(value) })),
    banned_phrases: Array.isArray(riskPolicy.banned_phrases) ? riskPolicy.banned_phrases : [],
    regulated_claims: Array.isArray(riskPolicy.regulated_claims) ? riskPolicy.regulated_claims : [],
    channels: channels.map((channel) => {
      const secretKeys = ["source_url_env", "token_env", "api_key_env"].filter((key) => channel[key]);
      return {
        channel_id: channel.channel_id || "",
        type: channel.type || "",
        display_name: channel.display_name || channel.channel_id || "",
        monitored: Boolean(channel.monitored),
        secret_envs: secretKeys.map((key) => channel[key]),
        secrets_ready: secretKeys.every((key) => Boolean(process.env[channel[key] as string])),
      };
    }),
  };
}

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_BRAND_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_BRAND_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_BRAND_BUSABASE_API_KEY || ""
    : process.env.KELLY_BRAND_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_BRAND_BUSABASE_URL / KELLY_BRAND_BUSABASE_BASE_ID.",
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
    for (const key of ITEM_FIELD_KEYS) {
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

  function crToItem(cr: Record<string, unknown>) {
    const op = primaryOperation(cr) || {};
    const headCommit = (op.headCommit as Record<string, unknown>) || {};
    const fields = (headCommit.fields as Record<string, unknown>) || {};
    return {
      item_id: String(cr.id ?? ""),
      ref: typeof fields.ref === "number" ? fields.ref : 0,
      type: (fields.type as string) || "",
      phase: (fields.phase as string) || "",
      sub_skill: (fields.sub_skill as string) || "",
      title: (fields.title as string) || "",
      draft: (fields.draft as string) || "",
      status: STATUS_MAP[cr.status as string] || "needs_review",
      risk: Array.isArray(fields.risk) ? fields.risk : [],
      // Busabase-specific handles, used by applyDecision:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
    };
  }

  function countStatuses(items: Array<{ status: string }>) {
    let needsReview = 0;
    let canonical = 0;
    for (const item of items) {
      if (item.status === "needs_review") needsReview += 1;
      if (item.status === "approved") canonical += 1;
    }
    return { needs_review: needsReview, canonical };
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
        const items = list.map(crToItem);
        const counts = countStatuses(items);
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
            brand_name: (summary.brand as Record<string, unknown>)?.name || "",
            framework: (summary.brand as Record<string, unknown>)?.framework || "TALE",
            positioning: { statement: "", status: "needs_review" },
            metrics: {
              item_count: items.length,
              canonical_count: counts.canonical,
              needs_review_count: counts.needs_review,
              pillar_count: items.filter((item: { type: string }) => item.type === "message_pillar").length,
              story_count: items.filter((item: { type: string }) => item.type === "story").length,
              proof_point_count: items.filter((item: { type: string }) => item.type === "proof_point").length,
              overall_nqs: 0,
              drift_open_count: 0,
            },
            items,
            drift_alerts: [],
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
      const itemId = String(payload.item_id || "");
      const action = String(payload.action || "");
      if (!itemId) throw new Error("item_id is required");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(itemId)}`);
      const op = primaryOperation(cr);
      const headCommit = (op?.headCommit as Record<string, unknown>) || {};
      const current = (headCommit.fields as Record<string, unknown>) || {};
      const nextFields = {
        ...current,
        ...(payload.draft !== undefined ? { draft: String(payload.draft) } : {}),
      };
      const edited = payload.draft !== undefined && payload.draft !== current.draft;

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id as string)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-brand" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id as string)}/revisions`, {
          payload: { fields: nextFields, message: payload.comment || "Saved edits", author: "kelly-brand" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/reviews`, {
          payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block" || action === "resolve_drift" || action === "dismiss_drift") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/close`, {
          reason: payload.comment || "Closed by reviewer",
        });
      } else {
        throw new Error(`Unsupported action: ${action}`);
      }
      return { updated_at: new Date().toISOString(), decisions: { [itemId]: { action } } };
    },

    async writeSnapshot(snapshot: Record<string, unknown>) {
      const created = [];
      for (const item of (snapshot.items as Array<Record<string, unknown>>) || []) {
        const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(item),
            message: `Narrative asset ${item.title || item.item_id}`,
            submittedBy: "kelly-brand",
          },
        });
        created.push({ item_id: item.item_id, change_request_id: cr?.id || null });
      }
      return { ok: true, created, count: created.length };
    },

    async writeExecutionReport() {
      // Promoting an approved narrative asset into the canonical registry is a
      // merge in Busabase; there is no separate execution-report file. Merge all
      // approved change requests.
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
