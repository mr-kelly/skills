// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. kelly-devops' unit of review is an ops action card
// (renew a domain, rotate a key, investigate spend, restart a service, ack an
// incident). Each action card maps onto a Busabase change_request whose commit
// `fields` carry the action's ops data; the human verdict is a review; the
// change-request status maps back onto kelly-devops' action statuses so the UI
// renders identically to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_DEVOPS_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_DEVOPS_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant Busabase needs no token; a token is only
// required by the cloud/multi-tenant deployment.
//
// The ops snapshot's telemetry sections (services/expiries/spend/events) are
// produced by the local check scripts and are not part of Busabase's model, so
// getSnapshot() returns the action cards populated and the telemetry sections
// empty. Run KELLY_DEVOPS_DATA_PROVIDER=local to gather telemetry; publish the
// action cards to Busabase for distributed review.

import { emptySnapshot } from "../common.ts";
import type {
  AgentTask,
  ConfigSummary,
  Decision,
  DecisionInput,
  DevopsSnapshot,
  DevopsState,
  Lock,
  Onboarding,
  OpsAction,
  ProviderMeta,
} from "../types.ts";

// Busabase change-request status -> kelly-devops action status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// kelly-devops verdict -> Busabase review verdict (approve/request_changes/block).
const VERDICTS = new Set(["approve", "request_changes", "block", "note"]);

// Action-card fields persisted into a change-request commit.
const ACTION_FIELD_KEYS = ["type", "title", "reason", "evidence", "plan", "target", "note", "ref"];

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_DEVOPS_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_DEVOPS_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_DEVOPS_BUSABASE_API_KEY || ""
    : process.env.KELLY_DEVOPS_BUSABASE_API_KEY || "";

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_DEVOPS_BUSABASE_URL / KELLY_DEVOPS_BUSABASE_BASE_ID.",
      );
    }
  }

  async function api(method: string, pathname: string, body?: unknown): Promise<unknown> {
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

  function pickFields(action: Record<string, unknown>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    for (const key of ACTION_FIELD_KEYS) {
      if (action[key] !== undefined) fields[key] = action[key];
    }
    return fields;
  }

  function primaryOperation(cr: Record<string, unknown>): Record<string, unknown> | null {
    const ops = cr.operations;
    return (
      (cr.primaryOperation as Record<string, unknown>) ||
      (Array.isArray(ops) ? (ops[0] as Record<string, unknown>) : null)
    );
  }

  function crToAction(cr: Record<string, unknown>, index: number): OpsAction {
    const op = primaryOperation(cr) || {};
    const head = (op.headCommit as Record<string, unknown>) || {};
    const fields = (head.fields as Record<string, unknown>) || {};
    const busaStatus = String(cr.status || "in_review");
    return {
      action_id: String(cr.id),
      ref: Number(fields.ref) || index + 1,
      type: String(fields.type || "ack_incident"),
      title: String(fields.title || "(untitled action)"),
      status: STATUS_MAP[busaStatus] || "needs_review",
      reason: String(fields.reason || ""),
      evidence: Array.isArray(fields.evidence) ? (fields.evidence as string[]) : [],
      plan: Array.isArray(fields.plan) ? (fields.plan as string[]) : [],
      target: (fields.target as Record<string, unknown>) || {},
      note: String(fields.note || ""),
      created_at: String(cr.createdAt || ""),
      decision: null,
    };
  }

  async function getSnapshot(): Promise<DevopsSnapshot> {
    const snapshot = emptySnapshot();
    snapshot.warnings = [];
    snapshot.generated_at = new Date().toISOString();
    snapshot.source = `busabase-${baseId}`;
    try {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : ((crs as Record<string, unknown>)?.items as unknown[]) || [];
      snapshot.actions = list.map((cr, index) => crToAction(cr as Record<string, unknown>, index));
      snapshot.metrics.actions_needing_review = snapshot.actions.filter(
        (action) => action.status === "needs_review",
      ).length;
    } catch (error) {
      snapshot.warnings = [
        { id: "busabase-error", severity: "error", message: `Busabase unreachable: ${(error as Error).message}` },
      ];
    }
    return snapshot;
  }

  async function getConfigSummary(): Promise<ConfigSummary> {
    // Config (services/domains/keys/billing) is local; Busabase holds review
    // state only. Report an empty-but-well-formed summary tagged busabase.
    return {
      config_path: `busabase://${baseUrl || "unset"}/${baseId || "unset"}`,
      is_example: false,
      thresholds: {},
      products: [],
      services: [],
      domains: [],
      key_rotation: [],
      billing_sources: [],
    };
  }

  return {
    name: "busabase",

    getSnapshot,
    getConfigSummary,

    async verifyConnection(): Promise<Record<string, unknown>> {
      requireConfig();
      await api("GET", "/api/v1/change-requests");
      return { ok: true, base_url: baseUrl, base_id: baseId };
    },

    async getState(): Promise<DevopsState> {
      const [snapshot, config_summary, onboarding, lock] = await Promise.all([
        getSnapshot(),
        getConfigSummary(),
        this.getOnboarding(),
        this.getLock(),
      ]);
      return {
        app: "kelly-devops",
        data_provider: "busabase",
        onboarding,
        lock,
        config_summary,
        snapshot,
      };
    },

    async saveSnapshot(snapshot: DevopsSnapshot): Promise<void> {
      // Telemetry sections are local-only; only the action cards are pushed as
      // change-requests. Create a change-request per action card not yet present.
      const existing = await getSnapshot();
      const known = new Set(existing.actions.map((action) => action.action_id));
      for (const action of snapshot.actions || []) {
        if (known.has(action.action_id)) continue;
        await api("POST", `/api/v1/bases/${encodeURIComponent(baseId)}/change-requests`, {
          payload: {
            fields: pickFields(action as unknown as Record<string, unknown>),
            message: `Ops action: ${action.title}`,
            submittedBy: "kelly-devops",
          },
        });
      }
    },

    async applyDecision({
      action_id,
      verdict,
      note,
    }: DecisionInput): Promise<{ action: OpsAction; decision: Decision }> {
      if (!action_id || typeof action_id !== "string") throw new Error("action_id is required");
      if (!verdict || !VERDICTS.has(verdict)) throw new Error(`verdict must be one of: ${[...VERDICTS].join(", ")}`);
      const decidedAt = new Date().toISOString();
      const comment = typeof note === "string" ? note : "";

      if (verdict === "approve") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(action_id)}/reviews`, {
          payload: { verdict: "approved", reason: comment || undefined },
        });
      } else if (verdict === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(action_id)}/reviews`, {
          payload: { verdict: "changes_requested", reason: comment || "Please revise" },
        });
      } else if (verdict === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(action_id)}/close`, {
          reason: comment || "Blocked by reviewer",
        });
      }
      // verdict === "note" records a comment only, no status change.
      const cr = (await api("GET", `/api/v1/change-requests/${encodeURIComponent(action_id)}`)) as Record<
        string,
        unknown
      >;
      const action = crToAction(cr, 0);
      const decision: Decision = { action_id, verdict, note: comment, decided_at: decidedAt };
      action.decision = decision;
      return { action, decision };
    },

    async getAgentTasks(): Promise<AgentTask[]> {
      try {
        const tasks = await api("GET", "/api/v1/agent/tasks");
        const list = Array.isArray(tasks) ? tasks : ((tasks as Record<string, unknown>)?.items as unknown[]) || [];
        return list as AgentTask[];
      } catch {
        return [];
      }
    },

    async getOnboarding(): Promise<Onboarding> {
      // Remote review is inherently "set up"; onboarding is a local UX gate.
      return { completed: Boolean(baseUrl && baseId), config_version: "busabase" };
    },

    async completeOnboarding(marker: Partial<Onboarding> = {}): Promise<Onboarding> {
      return { completed: true, completed_at: marker.completed_at || new Date().toISOString(), ...marker };
    },

    async getLock(): Promise<Lock | null> {
      // Busabase serializes writes server-side; there is no client-held lock.
      return null;
    },

    async acquireLock(): Promise<void> {
      // No-op: Busabase does not use a client-side lock file.
    },

    async releaseLock(): Promise<void> {
      // No-op: see acquireLock.
    },
  };
}
