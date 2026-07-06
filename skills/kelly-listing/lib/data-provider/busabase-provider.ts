// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the review protocol over REST, so this is a mapping layer,
// not a backend. A listing draft's fields (title/bullets/description/...) live
// in a Busabase record's commit `fields`; an agent draft is a change_request,
// the human verdict is a review, publishing is a merge. The change-request
// status maps back onto kelly-listing's draft statuses so the UI is identical
// to local mode.
//
// The claims/compliance registry maps onto two Busabase record collections
// (claims + claim rules) under the same base, read through the records API.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_LISTING_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_LISTING_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant Busabase needs no token; a token is only
// required by the cloud/multi-tenant deployment.

import type {
  BusabaseConfig,
  ClaimPayload,
  ClaimRule,
  ClaimsRegistry,
  ConfigResult,
  DecisionPayload,
  HttpError,
  ProviderMeta,
} from "../types.ts";

const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

const DRAFT_FIELD_KEYS = [
  "title",
  "subtitle",
  "bullets",
  "description",
  "search_terms",
  "seo_title",
  "seo_description",
  "selling_points",
  "aplus_outline",
  "item_specifics",
  "platform",
  "locale",
  "product_id",
];

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = (meta.config?.busabase as BusabaseConfig) || {};
  const baseUrl = (process.env.KELLY_LISTING_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_LISTING_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_LISTING_BUSABASE_API_KEY || ""
    : process.env.KELLY_LISTING_BUSABASE_API_KEY || "";

  function requireConfig() {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_LISTING_BUSABASE_URL / KELLY_LISTING_BUSABASE_BASE_ID.",
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

  function primaryOperation(cr) {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToDraft(cr, index: number) {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    const platform = fields.platform || "amazon";
    return {
      draft_id: cr.id,
      ref: index + 1,
      product_id: fields.product_id || "",
      platform,
      locale: fields.locale || "US",
      status: STATUS_MAP[cr.status] || "needs_review",
      compliance_score: 0,
      fields: {
        title: fields.title || "",
        subtitle: fields.subtitle || "",
        bullets: Array.isArray(fields.bullets) ? fields.bullets : [],
        description: fields.description || "",
        search_terms: fields.search_terms || "",
        seo_title: fields.seo_title || "",
        seo_description: fields.seo_description || "",
        selling_points: Array.isArray(fields.selling_points) ? fields.selling_points : [],
        aplus_outline: Array.isArray(fields.aplus_outline) ? fields.aplus_outline : [],
        item_specifics: Array.isArray(fields.item_specifics) ? fields.item_specifics : [],
      },
      operation_id: op.id || null,
      busabase_status: cr.status,
      created_at: cr.createdAt || "",
      updated_at: cr.updatedAt || "",
    };
  }

  function recordToClaim(record) {
    const f = record.fields || record;
    return {
      claim_id: record.id || f.claim_id,
      text: f.text || "",
      status: f.status || "pending",
      category: f.category || "",
      substantiation: f.substantiation || "",
      evidence: Array.isArray(f.evidence) ? f.evidence : [],
      approved_by: f.approved_by || "",
      approved_at: f.approved_at || "",
      notes: f.notes || "",
      created_at: f.created_at || "",
      updated_at: f.updated_at || "",
    };
  }

  function recordToRule(record): ClaimRule {
    const f = record.fields || record;
    return {
      rule_id: record.id || f.rule_id,
      phrase: f.phrase || "",
      type: f.type === "restricted_phrase" ? "restricted_phrase" : "banned_word",
      severity: f.severity || "error",
      reason: f.reason || "",
      alternative: f.alternative || "",
      created_at: f.created_at || "",
    };
  }

  function pickDraftFields(item) {
    const fields: Record<string, unknown> = {};
    const source = {
      ...(item.fields || {}),
      platform: item.platform,
      locale: item.locale,
      product_id: item.product_id,
    };
    for (const key of DRAFT_FIELD_KEYS) {
      if (source[key] !== undefined) fields[key] = source[key];
    }
    return fields;
  }

  const provider = {
    kind: "busabase",

    async readConfig(): Promise<ConfigResult> {
      return { config: meta.config || {}, path: meta.source || "", is_example: Boolean(meta.is_example) };
    },

    async readLock() {
      return null;
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

    async writeAgentTasks() {
      throw notSupported("agent tasks are managed by Busabase");
    },

    async readExecutionReport() {
      return null;
    },

    async writeExecutionReport() {
      throw notSupported("execution reports are managed by Busabase merges");
    },

    async readSnapshot() {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      const drafts = list.map((cr, index) => crToDraft(cr, index));
      return {
        schema_version: "1",
        generated_at: new Date().toISOString(),
        source: "busabase",
        seller: { brand: "", entity: "" },
        metrics: {},
        products: [],
        drafts,
        rules: [],
        checks: [],
        review_items: drafts.map((draft) => ({
          review_id: draft.draft_id,
          ref: draft.ref,
          draft_id: draft.draft_id,
          status: draft.status,
          compliance_summary: "",
          suggestions: [],
        })),
        activity_log: [],
        warnings: [],
      };
    },

    async writeSnapshot() {
      throw notSupported("the snapshot is derived from Busabase change-requests");
    },

    // ── claims / compliance registry ─────────────────────────────────────────
    async readClaims(): Promise<ClaimsRegistry> {
      try {
        const [claimRecords, ruleRecords] = await Promise.all([
          api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}/tables/claims/records`),
          api("GET", `/api/v1/bases/${encodeURIComponent(baseId)}/tables/claim_rules/records`),
        ]);
        const claimList = Array.isArray(claimRecords) ? claimRecords : claimRecords?.items || [];
        const ruleList = Array.isArray(ruleRecords) ? ruleRecords : ruleRecords?.items || [];
        return {
          updated_at: new Date().toISOString(),
          claims: claimList.map(recordToClaim),
          rules: ruleList.map(recordToRule),
        };
      } catch {
        return { updated_at: "", claims: [], rules: [] };
      }
    },

    async writeClaims() {
      throw notSupported("the claims registry is stored as Busabase records; upsert via saveClaim/saveClaimRule");
    },

    async saveClaim(payload: ClaimPayload) {
      if (!payload?.text) {
        const error: HttpError = new Error("missing claim text");
        error.statusCode = 400;
        throw error;
      }
      const fields = {
        text: payload.text,
        status: payload.status || "pending",
        category: payload.category || "",
        substantiation: payload.substantiation || "",
        evidence: payload.evidence || [],
        approved_by: payload.approved_by || "",
        notes: payload.notes || "",
        updated_at: new Date().toISOString(),
      };
      if (payload.claim_id) {
        const record = await api(
          "PATCH",
          `/api/v1/bases/${encodeURIComponent(baseId)}/tables/claims/records/${encodeURIComponent(payload.claim_id)}`,
          { fields },
        );
        return { ok: true, claim: recordToClaim(record) };
      }
      const record = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/tables/claims/records`, { fields });
      return { ok: true, claim: recordToClaim(record) };
    },

    async saveClaimRule(payload: Partial<ClaimRule>) {
      if (!payload?.phrase) {
        const error: HttpError = new Error("missing rule phrase");
        error.statusCode = 400;
        throw error;
      }
      const fields = {
        phrase: payload.phrase,
        type: payload.type === "restricted_phrase" ? "restricted_phrase" : "banned_word",
        severity: payload.severity || "error",
        reason: payload.reason || "",
        alternative: payload.alternative || "",
      };
      if (payload.rule_id) {
        const record = await api(
          "PATCH",
          `/api/v1/bases/${encodeURIComponent(baseId)}/tables/claim_rules/records/${encodeURIComponent(payload.rule_id)}`,
          { fields },
        );
        return { ok: true, rule: recordToRule(record) };
      }
      const record = await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/tables/claim_rules/records`, {
        fields,
      });
      return { ok: true, rule: recordToRule(record) };
    },

    async applyDecision(payload: DecisionPayload = {}) {
      const id = String(payload.review_id || payload.draft_id || "");
      if (!id) {
        const error: HttpError = new Error("review_id is required");
        error.statusCode = 400;
        throw error;
      }
      const action = String(payload.action || "revise");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(id)}`);
      const op = primaryOperation(cr);
      const current = op?.headCommit?.fields || {};
      const nextFields = {
        ...current,
        ...(payload.fields && typeof payload.fields === "object" ? payload.fields : {}),
      };
      const edited = Boolean(payload.fields && typeof payload.fields === "object");

      if (action === "approve") {
        if (edited && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
            payload: { fields: nextFields, message: "Edited before approval", author: "kelly-listing" },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: payload.comment || "Saved edits", author: "kelly-listing" },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
          payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/close`, {
          reason: payload.comment || "Blocked by reviewer",
        });
      } else {
        const error: HttpError = new Error(`Unknown action: ${action}`);
        error.statusCode = 400;
        throw error;
      }
      return { updated_at: new Date().toISOString(), decisions: { [id]: { action } } };
    },

    async getState() {
      const summary = {
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
        publishing_connectors: "busabase",
      };
      try {
        const [snapshot, agentTasks, claims] = await Promise.all([
          this.readSnapshot(),
          this.readAgentTasks(),
          this.readClaims(),
        ]);
        return {
          app: "kelly-listing",
          data_provider: this.kind,
          onboarding: { completed: true },
          lock: null,
          config_summary: summary,
          decisions: { updated_at: "", decisions: {} },
          agent_tasks: agentTasks,
          execution_report: null,
          claims,
          snapshot,
        };
      } catch (error) {
        return {
          app: "kelly-listing",
          data_provider: this.kind,
          onboarding: { completed: true },
          lock: null,
          config_summary: { ...summary, error: (error as Error).message },
          decisions: { updated_at: "", decisions: {} },
          agent_tasks: { updated_at: "", tasks: [] },
          execution_report: null,
          claims: { updated_at: "", claims: [], rules: [] },
          snapshot: {
            schema_version: "1",
            generated_at: new Date().toISOString(),
            source: "busabase",
            seller: { brand: "", entity: "" },
            metrics: {},
            products: [],
            drafts: [],
            rules: [],
            checks: [],
            review_items: [],
            activity_log: [],
            warnings: [],
          },
        };
      }
    },
  };
  return provider;
}

function notSupported(detail: string): HttpError {
  const error: HttpError = new Error(
    `Not supported in busabase mode: ${detail}. Use KELLY_LISTING_DATA_PROVIDER=local for offline authoring.`,
  );
  error.statusCode = 400;
  return error;
}
