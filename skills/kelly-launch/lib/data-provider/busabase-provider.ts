// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. A launch item's fields (title/draft/channel/...) live in
// a Busabase record's commit `fields`; an agent draft is a change_request, the
// human verdict is a review, an edit is an operation revision, shipping is a
// merge. The change-request status maps back onto kelly-launch's workflow
// statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_LAUNCH_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_LAUNCH_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant),
//                    with KELLY_LAUNCH_BUSABASE_API_KEY as the direct fallback.
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by the multi-tenant cloud deployment.

import type { ConfigResult, DecisionBody, HttpError, ProviderMeta } from "../types.ts";
import { summarizeConfig } from "./provider-interface.ts";

// Busabase change-request status -> kelly-launch workflow status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

// Busabase change-request status -> kelly-launch RAMP readiness verdict.
const READINESS_MAP: Record<string, string> = {
  in_review: "FIX",
  changes_requested: "FIX",
  approved: "SHIP",
  merged: "SHIP",
  rejected: "BLOCK",
  abandoned: "BLOCK",
};

export function createBusabaseProvider(meta: ProviderMeta = {}) {
  const busa = (meta.config?.busabase as Record<string, unknown>) || {};
  const baseUrl = (process.env.KELLY_LAUNCH_BUSABASE_URL || (busa.base_url as string) || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_LAUNCH_BUSABASE_BASE_ID || (busa.base_id as string) || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env as string] || process.env.KELLY_LAUNCH_BUSABASE_API_KEY || ""
    : process.env.KELLY_LAUNCH_BUSABASE_API_KEY || "";

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_LAUNCH_BUSABASE_URL / KELLY_LAUNCH_BUSABASE_BASE_ID.",
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

  function primaryOperation(cr: Record<string, unknown>): Record<string, unknown> | null {
    const ops = cr.operations as Array<Record<string, unknown>> | undefined;
    return (cr.primaryOperation as Record<string, unknown>) || (Array.isArray(ops) ? ops[0] : null);
  }

  function crToItem(cr: Record<string, unknown>, index: number): Record<string, unknown> {
    const op = primaryOperation(cr) || {};
    const fields = ((op.headCommit as Record<string, unknown>)?.fields as Record<string, unknown>) || {};
    const status = String(cr.status || "in_review");
    return {
      item_id: String(cr.id),
      ref: index + 1,
      phase: (fields.phase as string) || "mobilize",
      title: (fields.title as string) || "(untitled)",
      owner: (fields.owner as string) || "",
      channel_id: (fields.channel_id as string) || "",
      readiness: READINESS_MAP[status] || "FIX",
      proposed_action: (fields.proposed_action as string) || "no_action",
      status: STATUS_MAP[status] || "needs_review",
      draft: typeof fields.draft === "string" ? fields.draft : "",
      suggested_reply: (fields.suggested_reply as string) || (fields.draft as string) || "",
      reason: (fields.reason as string) || "",
      format: (fields.format as string) || "",
      risk: [],
      // Busabase-specific handles, used by applyDecision:
      operation_id: op.id || null,
      busabase_status: status,
    };
  }

  function countByReadiness(items: Array<Record<string, unknown>>) {
    return {
      ship: items.filter((entry) => entry.readiness === "SHIP").length,
      fix: items.filter((entry) => entry.readiness === "FIX").length,
      block: items.filter((entry) => entry.readiness === "BLOCK").length,
    };
  }

  function countByStatus(items: Array<Record<string, unknown>>) {
    return {
      needs_review: items.filter((entry) => entry.status === "needs_review").length,
      approved: items.filter((entry) => entry.status === "approved").length,
      done: items.filter((entry) => entry.status === "done").length,
      blocked: items.filter((entry) => entry.status === "blocked").length,
    };
  }

  function snapshotFrom(items: Array<Record<string, unknown>>): Record<string, unknown> {
    const ship = countByReadiness(items);
    const statusCounts = countByStatus(items);
    const blockers = items
      .filter((entry) => entry.readiness === "BLOCK")
      .map((entry) => ({ item_id: entry.item_id, ref: entry.ref, title: entry.title, phase: entry.phase }));
    const verdict = blockers.length ? "FIX" : ship.block ? "BLOCK" : "SHIP";
    const lqs = items.length ? Math.round(((ship.ship + ship.fix * 0.5) / items.length) * 100) : 0;
    return {
      schema_version: "1",
      generated_at: new Date().toISOString(),
      source: "busabase",
      product: { name: "", tagline: "", homepage: "", category: "" },
      launch: { target_date: "", timezone: "UTC" },
      phases: ["research", "assemble", "mobilize", "prove"],
      readiness: { verdict, lqs, ship: ship.ship, fix: ship.fix, block: ship.block, blockers },
      metrics: {
        item_count: items.length,
        needs_review: statusCounts.needs_review,
        approved: statusCounts.approved,
        done: statusCounts.done,
        blocked: statusCounts.blocked,
        ship: ship.ship,
        fix: ship.fix,
        block: ship.block,
      },
      channels: [],
      items,
      runbook: [],
      warnings: [],
    };
  }

  const configResult = (): ConfigResult => ({
    config: meta.config || { channels: [] },
    path: meta.source || "",
    is_example: Boolean(meta.is_example),
  });

  return {
    kind: "busabase",

    configSummary(): Record<string, unknown> {
      return {
        ...summarizeConfig(configResult()),
        provider: "busabase",
        base_url: baseUrl || null,
        base_id: baseId || null,
        api_key: apiKey ? "configured" : "none",
      };
    },

    async readConfig(): Promise<ConfigResult> {
      return configResult();
    },

    async readLock(): Promise<Record<string, unknown> | null> {
      // Busabase serializes writes server-side; there is no local file lock.
      return null;
    },

    async readOnboarding(): Promise<Record<string, unknown>> {
      // Onboarding is a local concept; against Busabase we treat a configured
      // base as onboarded.
      return { completed: Boolean(baseUrl && baseId) };
    },

    async readSnapshot(): Promise<Record<string, unknown>> {
      const crs = await api("GET", "/api/v1/change-requests");
      const list = Array.isArray(crs) ? crs : crs?.items || [];
      return snapshotFrom(list.map(crToItem));
    },

    async readDecisions(): Promise<Record<string, unknown>> {
      // Verdicts live on Busabase reviews, not a local decisions file.
      return { updated_at: "", decisions: {} };
    },

    async readAgentTasks(): Promise<Record<string, unknown>> {
      const tasks = await api("GET", "/api/v1/agent/tasks").catch(() => null);
      const list = Array.isArray(tasks) ? tasks : tasks?.items || [];
      return { updated_at: "", tasks: list };
    },

    async readExecutionReport(): Promise<Record<string, unknown> | null> {
      return null;
    },

    async getState(): Promise<Record<string, unknown>> {
      const summary = this.configSummary();
      try {
        const crs = await api("GET", "/api/v1/change-requests");
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        const items = list.map(crToItem);
        return {
          data_provider: "busabase",
          onboarding: await this.readOnboarding(),
          lock: null,
          config_summary: summary,
          decisions: { updated_at: "", decisions: {} },
          agent_tasks: await this.readAgentTasks(),
          execution_report: null,
          snapshot: snapshotFrom(items),
        };
      } catch (error) {
        return {
          data_provider: "busabase",
          onboarding: { completed: false },
          lock: null,
          config_summary: { ...summary, error: (error as Error).message },
          decisions: { updated_at: "", decisions: {} },
          agent_tasks: { updated_at: "", tasks: [] },
          execution_report: null,
          snapshot: snapshotFrom([]),
        };
      }
    },

    async applyDecision(payload: DecisionBody = {}): Promise<Record<string, unknown>> {
      const itemId = String(payload.item_id || "");
      if (!itemId) {
        const error: HttpError = new Error("item_id is required");
        error.statusCode = 400;
        throw error;
      }
      const action = String(payload.action || "");
      const cr = await api("GET", `/api/v1/change-requests/${encodeURIComponent(itemId)}`);
      const op = primaryOperation(cr);
      const current = ((op?.headCommit as Record<string, unknown>)?.fields as Record<string, unknown>) || {};

      if (action === "approve") {
        if (payload.draft !== undefined && op) {
          await api("POST", `/api/v1/operations/${encodeURIComponent(String(op.id))}/revisions`, {
            payload: {
              fields: { ...current, draft: payload.draft },
              message: "Edited before approval",
              author: "kelly-launch",
            },
          });
        }
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/reviews`, {
          payload: { verdict: "approved", reason: payload.comment || undefined },
        });
      } else if (action === "revise") {
        if (!op) throw new Error("change request has no operation to revise");
        await api("POST", `/api/v1/operations/${encodeURIComponent(String(op.id))}/revisions`, {
          payload: {
            fields: { ...current, ...(payload.draft !== undefined ? { draft: payload.draft } : {}) },
            message: payload.comment || "Saved edits",
            author: "kelly-launch",
          },
        });
      } else if (action === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/reviews`, {
          payload: { verdict: "rejected", reason: payload.comment || "Please revise" },
        });
      } else if (action === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(itemId)}/close`, {
          reason: payload.comment || "Blocked by reviewer",
        });
      } else {
        const error: HttpError = new Error(`Unsupported action: ${action}`);
        error.statusCode = 400;
        throw error;
      }
      return { ok: true, action, item_id: itemId };
    },

    async verifyConnection(): Promise<Record<string, unknown>> {
      requireConfig();
      await api("GET", "/api/v1/change-requests");
      return { ok: true, base_url: baseUrl, base_id: baseId };
    },
  };
}
