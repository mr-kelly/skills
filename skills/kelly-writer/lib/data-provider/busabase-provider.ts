// Busabase ReviewProvider: a thin HTTP client to a Busabase base.
//
// Busabase (#4437) publishes the whole review protocol over REST, so this is a
// mapping layer, not a backend. Content fields (title/body/channel/...) live in
// a Busabase record's commit `fields`; an agent draft is a change_request, the
// human verdict is a review, an edit is an operation revision, publishing is a
// merge. The change-request status maps back onto kelly-writer's workflow
// statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_WRITER_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_WRITER_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type { HttpError, ProviderMeta } from "../types.ts";

const STATUS_MAP = {
  in_review: "to_approve",
  changes_requested: "needs_review",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const CONTENT_FIELD_KEYS = ["title", "body", "channel", "summary", "format", "cta", "hashtags", "media_brief", "hook"];

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (
    process.env.KELLY_WRITER_BUSABASE_URL ||
    process.env.KELLY_CONTENT_BUSABASE_URL ||
    busa.base_url ||
    ""
  ).replace(/\/$/, "");
  const baseId =
    process.env.KELLY_WRITER_BUSABASE_BASE_ID || process.env.KELLY_CONTENT_BUSABASE_BASE_ID || busa.base_id || "";
  const fallbackApiKey = process.env.KELLY_WRITER_BUSABASE_API_KEY || process.env.KELLY_CONTENT_BUSABASE_API_KEY || "";
  const apiKey = busa.api_key_env ? process.env[busa.api_key_env] || fallbackApiKey : fallbackApiKey;

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_WRITER_BUSABASE_URL / KELLY_WRITER_BUSABASE_BASE_ID.",
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

  function pickFields(item) {
    const fields = {};
    for (const key of CONTENT_FIELD_KEYS) {
      if (item[key] !== undefined) fields[key] = item[key];
    }
    return fields;
  }

  function primaryOperation(cr) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToItem(cr) {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      id: cr.id,
      ref: `CR ${String(cr.id).slice(0, 8)}`,
      channel: fields.channel || "content",
      status: STATUS_MAP[cr.status] || "to_approve",
      title: fields.title || "(untitled)",
      summary: fields.summary || "",
      body: typeof fields.body === "string" ? fields.body : "",
      format: fields.format || "post",
      cta: fields.cta || "",
      hashtags: Array.isArray(fields.hashtags) ? fields.hashtags : [],
      media_brief: fields.media_brief || "",
      hook: fields.hook || "",
      // Busabase-specific handles, used by saveDecision/diff:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      base_fields: op.baseFields || null,
      busabase_status: cr.status,
      decision: null,
      execution: { status: cr.status === "merged" ? "done" : "pending" },
    };
  }

  function countStatuses(items) {
    const metrics = { needs_review: 0, to_approve: 0, approved: 0, done: 0, blocked: 0 };
    for (const item of items) {
      if (metrics[item.status] !== undefined) metrics[item.status] += 1;
    }
    return metrics;
  }

  return {
    name: "busabase",
    kind: "busabase",

    configSummary() {
      return {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        publishing_connectors: "busabase",
      };
    },

    async getState() {
      const summary = this.configSummary();
      try {
        const crs = await api("GET", "/api/v1/change-requests");
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        const items = list.map(crToItem);
        return {
          batch: {
            batch_id: `busabase-${baseId}`,
            generated_at: new Date().toISOString(),
            source: "busabase",
            mode: "app-in-skill",
            metrics: countStatuses(items),
            items,
            // Planning stages (topics/todos/main_content) are local-only.
            topics: [],
            todos: [],
          },
          decisions: {},
          lock: null,
          config_summary: summary,
        };
      } catch (error) {
        return {
          batch: null,
          decisions: {},
          lock: null,
          config_summary: { ...summary, error: (error as Error).message },
        };
      }
    },

    async saveDecision(payload) {
      if (!payload || !payload.id) {
        const error: HttpError = new Error("missing id");
        error.statusCode = 400;
        throw error;
      }
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(payload.id)}`);
      const op = primaryOperation(cr);
      const current = op?.headCommit?.fields || {};
      const action = payload.action || "revise";
      const nextFields = {
        ...current,
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.body ? { body: payload.body } : {}),
      };
      const edited =
        (payload.title && payload.title !== current.title) || (payload.body && payload.body !== current.body);

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-writer" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(payload.id)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: payload.comment || "Saved edits", author: "kelly-writer" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(payload.id)}/reviews`, {
          payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(payload.id)}/close`, {
          reason: payload.comment || "Closed by reviewer",
        });
      } else {
        const error: HttpError = new Error(`Unknown action: ${action}`);
        error.statusCode = 400;
        throw error;
      }
      return { ok: true, action };
    },

    async putBatch(batch) {
      const created = [];
      for (const item of batch.items || []) {
        const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(item),
            message: `Draft for ${item.channel || "content"}`,
            submittedBy: "kelly-writer",
          },
        });
        created.push({ item_id: item.id, change_request_id: cr?.id || null });
      }
      return { ok: true, created, count: created.length };
    },

    async exportApproved() {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      const merged = [];
      const skipped = [];
      for (const cr of list) {
        if (cr.status === "approved") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/merge`, {});
          merged.push({ id: cr.id });
        } else {
          skipped.push({ id: cr.id, reason: `status ${cr.status}` });
        }
      }
      return { exported: merged, skipped, output_dir: `${baseUrl} (base ${baseId})` };
    },

    async listAgentTasks() {
      const tasks = await api("GET", "/api/v1/agent/tasks");
      return Array.isArray(tasks) ? tasks : tasks?.items || [];
    },

    async confirmDirection() {
      const error: HttpError = new Error(
        "Ideation stages (topics/directions) are local-only. Use KELLY_WRITER_DATA_PROVIDER=local to plan, then publish to Busabase.",
      );
      error.statusCode = 400;
      throw error;
    },

    async completeTodo() {
      const error: HttpError = new Error(
        "Completing a local todo is only available with KELLY_WRITER_DATA_PROVIDER=local.",
      );
      error.statusCode = 400;
      throw error;
    },

    async requestDistribution() {
      const error: HttpError = new Error(
        "Moving a main draft into local distribution is only available with KELLY_WRITER_DATA_PROVIDER=local.",
      );
      error.statusCode = 400;
      throw error;
    },

    async completeDistributionRevision() {
      const error: HttpError = new Error(
        "Busabase Agent revisions update their change request directly and do not use the local completion endpoint.",
      );
      error.statusCode = 400;
      throw error;
    },
  };
}
