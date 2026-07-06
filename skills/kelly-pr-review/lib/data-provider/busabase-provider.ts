// Busabase ReviewProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. A pull request under review is a Busabase record; its
// review fields (title/summary/review_body/proposed_action/…) live in a commit's
// `fields`; the agent-prepared batch item is a change_request, the human verdict
// is a review, an in-place edit is an operation revision, and executing an
// approved review is a merge. The change-request status maps back onto
// kelly-pr-review's workflow statuses so the UI renders identically to local
// mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_PR_REVIEW_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_PR_REVIEW_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import type { HttpError, ProviderMeta } from "../types.ts";

// Busabase change-request status -> kelly-pr-review workflow status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "needs_review",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Verdict written to Busabase for each local review action.
const ACTION_VERDICT: Record<string, string> = {
  approve: "approved",
  comment: "approved",
  request_changes: "changes_requested",
  no_action: "approved",
  block: "rejected",
};

const REVIEW_FIELD_KEYS = [
  "repo",
  "number",
  "title",
  "author",
  "url",
  "summary",
  "body",
  "proposed_action",
  "reason",
  "risk",
  "labels",
  "changed_files",
  "additions",
  "deletions",
  "review_body",
  "patch_excerpt",
];

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = (meta.config?.busabase as Record<string, string> | undefined) || {};
  const baseUrl = (process.env.KELLY_PR_REVIEW_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_PR_REVIEW_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_PR_REVIEW_BUSABASE_API_KEY || ""
    : process.env.KELLY_PR_REVIEW_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_PR_REVIEW_BUSABASE_URL / KELLY_PR_REVIEW_BUSABASE_BASE_ID.",
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
    const fields: Record<string, unknown> = {};
    for (const key of REVIEW_FIELD_KEYS) {
      if (item[key] !== undefined) fields[key] = item[key];
    }
    return fields;
  }

  function primaryOperation(cr) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToItem(cr, index: number) {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    const repo = String(fields.repo || "");
    const number = Number(fields.number || 0);
    const merged = cr.status === "merged";
    return {
      id: fields.id || cr.id,
      review_ref: `Review #${index + 1}`,
      review_number: index + 1,
      repo,
      number,
      title: fields.title || "(untitled pull request)",
      author: fields.author || "",
      url: fields.url || "",
      summary: fields.summary || "",
      body: typeof fields.body === "string" ? fields.body : "",
      status: STATUS_MAP[cr.status] || "needs_review",
      proposed_action: fields.proposed_action || "comment",
      reason: fields.reason || "",
      risk: Array.isArray(fields.risk) ? fields.risk : [],
      labels: Array.isArray(fields.labels) ? fields.labels : [],
      changed_files: Array.isArray(fields.changed_files) ? fields.changed_files : [],
      additions: Number(fields.additions || 0),
      deletions: Number(fields.deletions || 0),
      comments_count: Number(fields.comments_count || 0),
      checks: fields.checks || "",
      state: fields.state || "",
      merged,
      merged_at: fields.merged_at || "",
      verification_status: merged ? "needs_test" : "",
      tested: false,
      tested_at: "",
      test_note: "",
      test_evidence: [],
      is_draft: Boolean(fields.is_draft),
      created_at: fields.created_at || "",
      updated_at: fields.updated_at || new Date().toISOString(),
      review_body: fields.review_body || "",
      patch_excerpt: fields.patch_excerpt || "",
      // Busabase-specific handles, used by saveDecision/saveDetail:
      change_request_id: cr.id,
      operation_id: op.id || null,
      busabase_status: cr.status,
      decision: {},
      execution: { status: merged ? "done" : "pending" },
    };
  }

  function countByWorkflow(items) {
    const metrics = { needs_review: 0, to_approve: 0, approved: 0, done: 0, blocked: 0, needs_test: 0, tested: 0 };
    for (const item of items) {
      if (metrics[item.status] !== undefined) metrics[item.status] += 1;
      if (item.verification_status === "needs_test") metrics.needs_test += 1;
      if (item.verification_status === "tested") metrics.tested += 1;
    }
    return metrics;
  }

  function reposFor(items) {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.repo) continue;
      counts.set(item.repo, (counts.get(item.repo) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([repo, count]) => ({ repo, count }));
  }

  async function loadItems() {
    const crs = await api("GET", "/api/v1/change-requests");
    const list = Array.isArray(crs) ? crs : crs?.items || [];
    return list.map((cr, index) => crToItem(cr, index));
  }

  async function findChangeRequest(id: string) {
    const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(id)}`);
    if (!cr) {
      const error: HttpError = new Error(`Unknown item: ${id}`);
      error.statusCode = 404;
      throw error;
    }
    return cr;
  }

  return {
    kind: "busabase",

    configSummary() {
      return {
        reader: "busabase",
        configured: Boolean(baseUrl && baseId),
        source: baseUrl ? `${baseUrl} (base ${baseId})` : "",
        default_mode: false,
        onboarding: {
          configured: Boolean(baseUrl && baseId),
          state: baseUrl && baseId ? "ready" : "unconfigured",
          message:
            baseUrl && baseId
              ? "Kelly PR Review is reading from Busabase."
              : "Set KELLY_PR_REVIEW_BUSABASE_URL and KELLY_PR_REVIEW_BUSABASE_BASE_ID.",
        },
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
      };
    },

    async getLock() {
      // Busabase serializes writes server-side; there is no local lock file.
      return { locked: false };
    },

    async loadBatch() {
      const items = await loadItems();
      return {
        batch_id: `busabase-${baseId}`,
        generated_at: new Date().toISOString(),
        source: "busabase",
        mode: "app-in-skill",
        metrics: countByWorkflow(items),
        items,
      };
    },

    // Batch/decisions/execution files are local-only handoffs; on Busabase the
    // base *is* the source of truth, so these are no-ops or reads over the API.
    async saveBatch() {
      /* Busabase change-requests are created via putBatch-style POSTs, not by
         overwriting a batch file. No-op to keep the scripts provider-neutral. */
    },

    async writeDecisions() {
      return { batch_id: `busabase-${baseId}`, updated_at: new Date().toISOString(), decisions: [] };
    },

    async readDecisions(fallback: unknown = null) {
      return fallback ?? { decisions: [] };
    },

    async readExecutionReport(fallback: unknown = {}) {
      return fallback;
    },

    async writeExecutionReport() {
      /* Execution == merge on Busabase; no separate report file. */
    },

    async getState(query = {}) {
      const summary = this.configSummary();
      try {
        const allItems = await loadItems();
        const repo = String((query as Record<string, string>).repo || "all");
        const mode = String((query as Record<string, string>).mode || "all");
        const search = String((query as Record<string, string>).q || "")
          .toLowerCase()
          .trim();
        const repoItems = repo !== "all" ? allItems.filter((item) => item.repo === repo) : allItems;
        let items = repoItems.filter(
          (item) =>
            mode === "all" ||
            (mode === "needs_test"
              ? item.verification_status === "needs_test"
              : mode === "tested"
                ? item.verification_status === "tested"
                : item.status === mode),
        );
        if (search) {
          items = items.filter((item) =>
            `${item.review_ref} ${item.repo} ${item.number} ${item.title} ${item.author} ${item.summary}`
              .toLowerCase()
              .includes(search),
          );
        }
        items.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
        return {
          app: "kelly-pr-review",
          batch: {
            batch_id: `busabase-${baseId}`,
            generated_at: new Date().toISOString(),
            source: "busabase",
            mode: "app-in-skill",
            metrics: countByWorkflow(allItems),
          },
          counts: countByWorkflow(repoItems),
          repos: reposFor(allItems),
          selected_repo: repo,
          items,
          total_cached: repoItems.length,
          total_all_repos: allItems.length,
          batch_path: `busabase://${baseId}/change-requests`,
          decisions_path: `busabase://${baseId}/reviews`,
          tested_path: `busabase://${baseId}/tested`,
          execution_report_path: `busabase://${baseId}/merges`,
          config_summary: summary,
          execution_report: {},
          lock: { locked: false },
        };
      } catch (error) {
        return {
          app: "kelly-pr-review",
          batch: null,
          counts: {},
          repos: [],
          selected_repo: "all",
          items: [],
          total_cached: 0,
          total_all_repos: 0,
          config_summary: { ...summary, error: (error as Error).message },
          execution_report: {},
          lock: { locked: false },
        };
      }
    },

    async saveDecision(body) {
      const ids = (body.ids || []).map(String);
      if (!ids.length) throw new Error("No items selected");
      const action = String(body.action || "");
      const verdict = ACTION_VERDICT[action];
      if (!verdict) throw new Error(`Unsupported decision: ${action}`);
      const changed: string[] = [];
      for (const id of ids) {
        const cr = await findChangeRequest(id);
        const op = primaryOperation(cr);
        const current = op?.headCommit?.fields || {};
        if (body.review_body !== undefined && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: {
              fields: { ...current, review_body: body.review_body || "" },
              message: "Edited review note before decision",
              author: "kelly-pr-review",
            },
          });
        }
        if (verdict === "approved") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/reviews`, {
            payload: { verdict: "approved", reason: body.comment || undefined },
          });
        } else if (verdict === "changes_requested") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/reviews`, {
            payload: { verdict: "rejected", reason: body.comment || "Please revise" },
          });
        } else if (verdict === "rejected") {
          await api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/close`, {
            reason: body.comment || "Blocked by reviewer",
          });
        }
        changed.push(id);
      }
      return { changed, decisions: changed.length };
    },

    async saveDetail(body) {
      const id = String((body as Record<string, string>).id || "");
      const cr = await findChangeRequest(id);
      const op = primaryOperation(cr);
      if (!op) throw new Error("change request has no operation to revise");
      const current = op.headCommit?.fields || {};
      const nextFields = { ...current };
      if (Object.hasOwn(body, "review_body")) nextFields.review_body = body.review_body || "";
      if (Object.hasOwn(body, "comment")) nextFields.reason = body.comment || "";
      await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
        payload: { fields: nextFields, message: "Saved review edits", author: "kelly-pr-review" },
      });
      return { id, decisions: 0 };
    },

    async setTested() {
      const error: HttpError = new Error(
        "Test verification is a local-only step. Use KELLY_PR_REVIEW_DATA_PROVIDER=local to record merged-PR tests.",
      );
      error.statusCode = 400;
      throw error;
    },

    // Provider extension used by generate_review_batch.ts when publishing an
    // agent-prepared batch to Busabase (parallels the local batch write).
    async putBatch(batch: { items?: Record<string, unknown>[] }) {
      const created = [];
      for (const item of batch.items || []) {
        const cr = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(item),
            message: `PR review draft for ${item.repo || "repo"}#${item.number || "?"}`,
            submittedBy: "kelly-pr-review",
          },
        });
        created.push({ item_id: item.id, change_request_id: cr?.id || null });
      }
      return { ok: true, created, count: created.length };
    },
  };
}
