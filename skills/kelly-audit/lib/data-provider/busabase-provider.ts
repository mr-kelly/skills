// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. An audit anomaly's fields (rule/title/reason/draft/...)
// live in a Busabase change-request's commit `fields`; the agent's proposed fix
// is the change_request, the human verdict (approve / request_changes / block /
// dismiss) is a review, and executing an approved fix is a merge. The change-
// request status maps back onto kelly-audit's workflow statuses so the UI renders
// identically to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_AUDIT_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_AUDIT_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`.

import { emptySnapshot } from "../audit-core.ts";
import type {
  AgentTasksFile,
  Anomaly,
  ApplyDecisionInput,
  ApplyDecisionResult,
  AuditSnapshot,
  DecisionsFile,
  ExecutionReport,
  LockRecord,
  Onboarding,
  ProviderMeta,
} from "../types.ts";
import type { DataProvider } from "./provider-interface.ts";

// Busabase change-request status -> kelly-audit workflow status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Anomaly fields carried in a change-request commit's `fields`.
const ANOMALY_FIELD_KEYS = [
  "rule",
  "severity",
  "title",
  "customer",
  "amount_at_stake",
  "currency",
  "aging_bucket",
  "reason",
  "proposed_action",
  "draft",
  "agent_notes",
];

export class BusabaseProvider implements DataProvider {
  readonly name = "busabase";

  #baseUrl: string;
  #baseId: string;
  #apiKey: string;

  constructor(meta: ProviderMeta = {}) {
    const busa = meta.config?.busabase || {};
    this.#baseUrl = (process.env.KELLY_AUDIT_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
    this.#baseId = process.env.KELLY_AUDIT_BUSABASE_BASE_ID || busa.base_id || "";
    this.#apiKey = busa.api_key_env
      ? process.env[busa.api_key_env] || process.env.KELLY_AUDIT_BUSABASE_API_KEY || ""
      : process.env.KELLY_AUDIT_BUSABASE_API_KEY || "";
  }

  #requireConfig(): void {
    if (!this.#baseUrl || !this.#baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_AUDIT_BUSABASE_URL / KELLY_AUDIT_BUSABASE_BASE_ID.",
      );
    }
  }

  async #api(method: string, pathname: string, body?: unknown): Promise<any> {
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

  #primaryOperation(cr: any): any {
    return cr?.primaryOperation || (Array.isArray(cr?.operations) ? cr.operations[0] : null);
  }

  #crToAnomaly(cr: any, index: number): Anomaly {
    const op = this.#primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      id: cr.id,
      ref: index + 1,
      rule: fields.rule || "irregular_entry",
      severity: fields.severity || "medium",
      status: STATUS_MAP[cr.status] || "needs_review",
      title: fields.title || "(untitled anomaly)",
      customer: fields.customer || "",
      amount_at_stake: Number(fields.amount_at_stake || 0),
      currency: fields.currency || "USD",
      aging_bucket: fields.aging_bucket || undefined,
      reason: fields.reason || "",
      evidence: { rows: [], computed: "", payment_ids: [] },
      proposed_action: fields.proposed_action || "flag_to_accountant",
      draft: typeof fields.draft === "string" ? fields.draft : "",
      agent_notes: fields.agent_notes || "",
      created_at: cr.createdAt || cr.created_at || "",
      decision: null,
      execution:
        cr.status === "merged" ? { status: "executed", operation: "", target: "", detail: "", executed_at: "" } : null,
    };
  }

  #fieldsFromSnapshotAnomaly(anomaly: Anomaly): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    const source = anomaly as unknown as Record<string, unknown>;
    for (const key of ANOMALY_FIELD_KEYS) {
      const value = source[key];
      if (value !== undefined) fields[key] = value;
    }
    return fields;
  }

  async readSnapshot(): Promise<AuditSnapshot> {
    const base = emptySnapshot();
    base.source = "busabase";
    base.warnings = [];
    try {
      const crs = await this.#api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      base.anomalies = list.map((cr: any, index: number) => this.#crToAnomaly(cr, index));
      base.generated_at = new Date().toISOString();
      base.company = { name: `busabase-${this.#baseId}` };
      base.metrics = {
        order_count: 0,
        invoice_count: 0,
        payment_count: 0,
        matched_payment_count: 0,
        matched_pct: 0,
        anomaly_count: base.anomalies.length,
        open_anomaly_count: base.anomalies.filter((a) => a.status === "needs_review").length,
        at_stake_total: base.anomalies.reduce((sum, a) => sum + Number(a.amount_at_stake || 0), 0),
        receivable_total: 0,
        overdue_receivable_total: 0,
        aging: [],
      };
    } catch (error) {
      base.warnings = [{ id: "busabase-error", severity: "high", message: (error as Error).message }];
    }
    return base;
  }

  async readOnboarding(): Promise<Onboarding> {
    return { completed: true };
  }

  async readLock(): Promise<LockRecord | null> {
    // Busabase serializes writes server-side; there is no client-held lock.
    return null;
  }

  async readDecisions(): Promise<DecisionsFile> {
    return { updated_at: "", decisions: {} };
  }

  async readAgentTasks(): Promise<AgentTasksFile> {
    try {
      const tasks = await this.#api("GET", "/api/v1/agent/tasks");
      const list = Array.isArray(tasks) ? tasks : tasks?.items || [];
      return { updated_at: new Date().toISOString(), tasks: list };
    } catch {
      return { updated_at: "", tasks: [] };
    }
  }

  async readExecutionReport(): Promise<ExecutionReport | null> {
    return null;
  }

  async ensureReady(): Promise<void> {
    this.#requireConfig();
  }

  async applyDecision({ id, action, note, draft }: ApplyDecisionInput): Promise<ApplyDecisionResult> {
    if (!id) return { ok: false, status: 400, error: "missing id" };
    const cr = await this.#api("GET", `/api/v1/change-requests/${encodeURIComponent(id)}`);
    const op = this.#primaryOperation(cr);
    const current = op?.headCommit?.fields || {};
    const nextFields = { ...current, ...(typeof draft === "string" ? { draft } : {}) };
    const edited = typeof draft === "string" && draft !== current.draft;

    if (action === "approve") {
      if (edited && op) {
        await this.#api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
          payload: { fields: nextFields, message: "Edited before approval", author: "kelly-audit" },
        });
      }
      await this.#api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
        payload: { verdict: "approved", reason: note || undefined },
      });
    } else if (action === "revise") {
      if (!op) return { ok: false, status: 400, error: "change request has no operation to revise" };
      await this.#api("POST", `/api/v1/operations/${encodeURIComponent(op.id)}/revisions`, {
        payload: { fields: nextFields, message: note || "Saved edits", author: "kelly-audit" },
      });
    } else if (action === "request_changes") {
      await this.#api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/reviews`, {
        payload: { verdict: "rejected", reason: note || "Please revise" },
      });
    } else if (action === "block" || action === "dismiss") {
      await this.#api("POST", `/api/v1/change-requests/${encodeURIComponent(id)}/close`, {
        reason: note || (action === "dismiss" ? "Dismissed by reviewer" : "Closed by reviewer"),
      });
    } else {
      return { ok: false, status: 400, error: `Unknown action: ${action}` };
    }
    return { ok: true };
  }

  async writeSnapshot(snapshot: AuditSnapshot): Promise<void> {
    // Push each anomaly as a change-request draft on the base.
    for (const anomaly of snapshot.anomalies || []) {
      await this.#api("POST", `/api/v1/bases/${encodeURIComponent(this.#baseId)}/change-requests`, {
        payload: {
          fields: this.#fieldsFromSnapshotAnomaly(anomaly),
          message: `Anomaly ${anomaly.rule}: ${anomaly.title}`,
          submittedBy: "kelly-audit",
        },
      });
    }
  }

  async writeExecutionReport(_report: ExecutionReport): Promise<void> {
    // Executing an approved anomaly is a merge on Busabase.
    const crs = await this.#api("GET", "/api/v1/change-requests");
    const list = Array.isArray(crs) ? crs : crs?.items || [];
    for (const cr of list) {
      if (cr.status === "approved") {
        await this.#api("POST", `/api/v1/change-requests/${encodeURIComponent(cr.id)}/merge`, {});
      }
    }
  }

  async acquireLock(_record: LockRecord): Promise<void> {
    // No client-held lock; Busabase serializes writes server-side.
  }

  async releaseLock(): Promise<void> {
    // No client-held lock.
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

export function createBusabaseProvider(meta: ProviderMeta = {}): DataProvider {
  return new BusabaseProvider(meta);
}
