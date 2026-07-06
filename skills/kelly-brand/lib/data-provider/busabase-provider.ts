// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. A narrative item's fields (title/draft/type/status/...)
// live in a Busabase record's commit `fields`; an agent draft is a
// change_request, the human verdict is a review, an edit is an operation
// revision, promotion to canonical is a merge. The change-request status maps
// back onto kelly-brand's workflow statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_BRAND_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_BRAND_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud` (or set KELLY_BRAND_BUSABASE_API_KEY).

import type {
  AgentTasksFile,
  BrandState,
  DecisionInput,
  DecisionsFile,
  HttpError,
  OnboardingMarker,
  ProviderMeta,
  Snapshot,
} from "../types.ts";
import type { DataProvider } from "./provider-interface.ts";

// Busabase change-request status -> kelly-brand workflow status. Mirrors the
// STATUSES set in scripts/validate_ui_schema.ts so the UI renders identically.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Narrative fields carried on a Busabase record commit.
const NARRATIVE_FIELD_KEYS = ["title", "draft", "type", "phase", "sub_skill", "reason", "nqs", "evidence", "risk"];

interface BusaOperation {
  id?: string;
  targetRecordId?: string;
  mergedRecordId?: string;
  baseFields?: Record<string, unknown> | null;
  headCommit?: { fields?: Record<string, unknown> };
}

interface BusaChangeRequest {
  id?: string;
  status?: string;
  primaryOperation?: BusaOperation;
  operations?: BusaOperation[];
}

export class BusabaseProvider implements DataProvider {
  readonly name = "busabase";
  #baseUrl: string;
  #baseId: string;
  #apiKey: string;

  constructor(meta: ProviderMeta = {}) {
    const busa = meta.config?.busabase || {};
    this.#baseUrl = (process.env.KELLY_BRAND_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
    this.#baseId = process.env.KELLY_BRAND_BUSABASE_BASE_ID || busa.base_id || "";
    this.#apiKey = busa.api_key_env
      ? process.env[busa.api_key_env] || process.env.KELLY_BRAND_BUSABASE_API_KEY || ""
      : process.env.KELLY_BRAND_BUSABASE_API_KEY || "";
  }

  #requireConfig(): void {
    if (!this.#baseUrl || !this.#baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_BRAND_BUSABASE_URL / KELLY_BRAND_BUSABASE_BASE_ID.",
      );
    }
  }

  async #api(method: string, pathname: string, body?: unknown): Promise<unknown> {
    this.#requireConfig();
    const res = await fetch(`${this.#baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.#apiKey ? { authorization: `Bearer ${this.#apiKey}` } : {}),
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

  #primaryOperation(cr: BusaChangeRequest): BusaOperation | null {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  #crToItem(cr: BusaChangeRequest): Record<string, unknown> {
    const op = this.#primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      item_id: cr.id,
      ref: String(cr.id ?? "").slice(0, 8),
      type: fields.type || "positioning",
      phase: fields.phase || "architect",
      sub_skill: fields.sub_skill || "",
      title: fields.title || "(untitled)",
      draft: typeof fields.draft === "string" ? fields.draft : "",
      status: STATUS_MAP[String(cr.status)] || "needs_review",
      nqs: fields.nqs ?? null,
      evidence: fields.evidence ?? null,
      risk: Array.isArray(fields.risk) ? fields.risk : [],
      reason: fields.reason || "",
      // Busabase-specific handles, used by applyDecision:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
    };
  }

  #countStatuses(items: Record<string, unknown>[]): Record<string, number> {
    const metrics = { item_count: items.length, canonical_count: 0, needs_review_count: 0 };
    for (const item of items) {
      if (item.status === "approved" || item.status === "done") metrics.canonical_count += 1;
      if (item.status === "needs_review") metrics.needs_review_count += 1;
    }
    return metrics;
  }

  #pickFields(item: Record<string, unknown>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    for (const key of NARRATIVE_FIELD_KEYS) {
      if (item[key] !== undefined) fields[key] = item[key];
    }
    return fields;
  }

  async getConfigSummary(): Promise<Record<string, unknown>> {
    return {
      provider: "busabase",
      base_url: this.#baseUrl || null,
      base_id: this.#baseId || null,
      api_key: this.#apiKey ? "configured" : "none",
      publishing_connectors: "busabase",
    };
  }

  async #snapshotFromBusabase(): Promise<{ snapshot: Snapshot; error?: string }> {
    try {
      const crs = (await this.#api("GET", "/api/v1/change-requests")) as
        | BusaChangeRequest[]
        | { items?: BusaChangeRequest[] };
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      const items = list.map((cr) => this.#crToItem(cr));
      const metrics = this.#countStatuses(items);
      return {
        snapshot: {
          schema_version: "1",
          generated_at: new Date().toISOString(),
          source: "busabase",
          brand_name: this.#baseId,
          framework: "TALE",
          positioning: {
            statement: String(items.find((item) => item.type === "positioning")?.draft || ""),
            status: "needs_review",
          },
          metrics: {
            item_count: metrics.item_count,
            canonical_count: metrics.canonical_count,
            needs_review_count: metrics.needs_review_count,
            pillar_count: items.filter((item) => item.type === "message_pillar").length,
            story_count: items.filter((item) => item.type === "story").length,
            proof_point_count: items.filter((item) => item.type === "proof_point").length,
            overall_nqs: 0,
            drift_open_count: 0,
          },
          items,
          // Drift monitoring is local-only.
          drift_alerts: [],
          warnings: [],
        },
      };
    } catch (error) {
      return { snapshot: {}, error: (error as Error).message };
    }
  }

  async getSnapshot(): Promise<Snapshot> {
    return (await this.#snapshotFromBusabase()).snapshot;
  }

  async getDecisions(): Promise<DecisionsFile> {
    return { updated_at: "", decisions: {} };
  }

  async getAgentTasks(): Promise<AgentTasksFile> {
    try {
      const tasks = (await this.#api("GET", "/api/v1/agent/tasks")) as
        | AgentTasksFile["tasks"]
        | { items?: AgentTasksFile["tasks"] };
      const list = Array.isArray(tasks) ? tasks : tasks?.items || [];
      return { updated_at: new Date().toISOString(), tasks: list };
    } catch {
      return { updated_at: "", tasks: [] };
    }
  }

  async getExecutionReport(): Promise<unknown> {
    return null;
  }

  async getLock(): Promise<unknown> {
    return null;
  }

  async getOnboarding(): Promise<OnboardingMarker> {
    return { completed: true, completed_at: new Date(0).toISOString(), config_version: "busabase" };
  }

  async getState(): Promise<BrandState> {
    const [{ snapshot, error }, decisions, agentTasks, config_summary] = await Promise.all([
      this.#snapshotFromBusabase(),
      this.getDecisions(),
      this.getAgentTasks(),
      this.getConfigSummary(),
    ]);
    return {
      data_provider: this.name,
      onboarding: await this.getOnboarding(),
      lock: null,
      config_summary: error ? { ...config_summary, error } : config_summary,
      decisions,
      agent_tasks: agentTasks,
      execution_report: null,
      snapshot,
    };
  }

  async applyDecision(payload: DecisionInput = {}): Promise<DecisionsFile> {
    const itemId = String(payload.item_id || "");
    if (!itemId) {
      const error: HttpError = new Error("item_id is required");
      error.statusCode = 400;
      throw error;
    }
    const action = String(payload.action || "");
    const cr = (await this.#api("GET", `/api/v1/change-requests/${encodeURIComponent(itemId)}`)) as BusaChangeRequest;
    const op = this.#primaryOperation(cr);
    const current = op?.headCommit?.fields || {};
    const nextFields = { ...current, ...(payload.draft ? { draft: payload.draft } : {}) };
    const edited = Boolean(payload.draft) && payload.draft !== current.draft;

    if (action === "approve") {
      if (edited && op) {
        await this.#api("POST", `/api/v1/operations/${encodeURIComponent(String(op.id))}/revisions`, {
          payload: { fields: nextFields, message: "Edited before approval", author: "kelly-brand" },
        });
      }
      await this.#api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/reviews`, {
        payload: { verdict: "approved", reason: payload.comment || undefined },
      });
    } else if (action === "revise") {
      if (!op) throw new Error("change request has no operation to revise");
      await this.#api("POST", `/api/v1/operations/${encodeURIComponent(String(op.id))}/revisions`, {
        payload: { fields: nextFields, message: payload.comment || "Saved edits", author: "kelly-brand" },
      });
    } else if (action === "request_changes") {
      await this.#api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/reviews`, {
        payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
      });
    } else if (action === "block") {
      await this.#api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/close`, {
        reason: payload.comment || "Closed by reviewer",
      });
    } else if (action === "resolve_drift" || action === "dismiss_drift") {
      const error: HttpError = new Error(
        "Drift monitoring is local-only. Use KELLY_BRAND_DATA_PROVIDER=local to resolve drift alerts.",
      );
      error.statusCode = 400;
      throw error;
    } else {
      const error: HttpError = new Error(`Unsupported action: ${action}`);
      error.statusCode = 400;
      throw error;
    }
    const now = new Date().toISOString();
    return {
      updated_at: now,
      decisions: { [itemId]: { action, comment: String(payload.comment || ""), decided_at: now } },
    };
  }

  async completeOnboarding(marker: Partial<OnboardingMarker> = {}): Promise<OnboardingMarker> {
    // Onboarding is a local-only setup marker; nothing to persist remotely.
    return {
      completed: true,
      completed_at: marker.completed_at || new Date().toISOString(),
      config_version: marker.config_version || "busabase",
    };
  }

  async writeExecutionReport(report: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Promotion happens by merging approved change requests in Busabase.
    const crs = (await this.#api("GET", "/api/v1/change-requests")) as
      | BusaChangeRequest[]
      | { items?: BusaChangeRequest[] };
    const list = Array.isArray(crs) ? crs : crs?.items || [];
    const merged: { id?: string }[] = [];
    for (const cr of list) {
      if (cr.status === "approved") {
        await this.#api("POST", `/api/v1/change-requests/${encodeURIComponent(String(cr.id))}/merge`, {});
        merged.push({ id: cr.id });
      }
    }
    return { ...report, merged };
  }

  async verifyConnection(): Promise<Record<string, unknown>> {
    try {
      await this.#api("GET", "/api/v1/change-requests");
      return { ok: true, base_url: this.#baseUrl, base_id: this.#baseId };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}

export function createBusabaseProvider(meta: ProviderMeta = {}): BusabaseProvider {
  return new BusabaseProvider(meta);
}
