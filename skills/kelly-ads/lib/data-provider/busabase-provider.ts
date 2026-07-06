// Busabase DataProvider: a thin HTTP client to a Busabase base.
//
// Busabase publishes the whole review protocol over REST, so this is a mapping
// layer, not a backend. An ads adjustment card (title/type/reason/current_value/
// proposed_value/...) lives in a Busabase record's commit `fields`; a drafted
// adjustment is a change_request, the human verdict is a review, publishing an
// approved card is a merge. The change-request status maps back onto kelly-ads'
// adjustment statuses so the UI is identical to local mode.
//
// Config (config.busabase, env overrides win):
//   base_url      KELLY_ADS_BUSABASE_URL       e.g. http://127.0.0.1:3000
//   base_id       KELLY_ADS_BUSABASE_BASE_ID   the target Busabase base
//   api_key_env   -> reads that env var as a Bearer token (cloud/multi-tenant)
//
// The open-source single-tenant `apps/busabase` needs no token; a token is only
// required by `apps/busabase-cloud`. The ideation-free ingest / anomaly checks
// are local-only: this provider serves the review desk (state + verdicts) and
// leaves snapshot computation to KELLY_ADS_DATA_PROVIDER=local.

import { emptySnapshot, readConfig, summarizeConfig } from "../common.ts";
import type {
  Adjustment,
  AdjustmentDecision,
  AdsSnapshot,
  ConfigResult,
  DecisionInput,
  DecisionsFile,
  HttpError,
  Lock,
  Onboarding,
  ProviderMeta,
} from "../types.ts";
import type { AdsState, DataProvider } from "./provider-interface.ts";

// Busabase change-request status -> kelly-ads adjustment status.
const STATUS_MAP: Record<string, string> = {
  in_review: "needs_review",
  changes_requested: "changes_requested",
  approved: "approved",
  merged: "done",
  rejected: "blocked",
  abandoned: "blocked",
};

export function createBusabaseProvider(meta: ProviderMeta = {}): DataProvider {
  const busa = meta.config?.busabase || {};
  const baseUrl = (process.env.KELLY_ADS_BUSABASE_URL || busa.base_url || "").replace(/\/$/, "");
  const baseId = process.env.KELLY_ADS_BUSABASE_BASE_ID || busa.base_id || "";
  const apiKey = busa.api_key_env
    ? process.env[busa.api_key_env] || process.env.KELLY_ADS_BUSABASE_API_KEY || ""
    : process.env.KELLY_ADS_BUSABASE_API_KEY || "";

  function requireConfig(): void {
    if (!baseUrl || !baseId) {
      throw new Error(
        "Busabase provider needs base_url and base_id. Set config.busabase.{base_url,base_id} " +
          "or KELLY_ADS_BUSABASE_URL / KELLY_ADS_BUSABASE_BASE_ID.",
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

  function primaryOperation(cr: Record<string, any>): Record<string, any> | null {
    return cr.primaryOperation || (Array.isArray(cr.operations) ? cr.operations[0] : null);
  }

  function crToAdjustment(cr: Record<string, any>): Adjustment {
    const op = primaryOperation(cr) || {};
    const fields = op.headCommit?.fields || {};
    return {
      adjustment_id: String(cr.id),
      ref: Number(fields.ref) || 0,
      type: fields.type || "bid_down",
      title: fields.title || "(untitled)",
      status: STATUS_MAP[cr.status] || "needs_review",
      campaign_id: fields.campaign_id || "",
      platform: fields.platform || "",
      reason: fields.reason || "",
      current_value: fields.current_value || "",
      proposed_value: fields.proposed_value || "",
      target: fields.target || {},
      evidence: Array.isArray(fields.evidence) ? fields.evidence : [],
      // Busabase-specific handles, used by applyDecision:
      operation_id: op.id || null,
      record_id: op.targetRecordId || op.mergedRecordId || null,
      busabase_status: cr.status,
      decision: undefined,
      execution: { status: cr.status === "merged" ? "done" : "pending" },
    };
  }

  function countStatuses(items: Adjustment[]): Record<string, number> {
    const metrics: Record<string, number> = {
      needs_review: 0,
      changes_requested: 0,
      approved: 0,
      done: 0,
      blocked: 0,
    };
    for (const item of items) {
      if (metrics[item.status] !== undefined) metrics[item.status] += 1;
    }
    return metrics;
  }

  const provider: DataProvider = {
    name: "busabase",

    async ensureDirs(): Promise<void> {
      // No local storage to create; Busabase is the store.
    },

    async readConfig(): Promise<ConfigResult> {
      if (meta.config && meta.source !== undefined) {
        return { config: meta.config, path: meta.source || "", is_example: Boolean(meta.is_example) };
      }
      return readConfig();
    },

    summarizeConfig(configResult: ConfigResult) {
      return summarizeConfig(configResult);
    },

    async readOnboarding(): Promise<Onboarding> {
      return { completed: true };
    },

    async readLock(): Promise<Lock | null> {
      return null;
    },

    async acquireLock(): Promise<void> {
      // Busabase serializes writes server-side; no client-held lock file.
    },

    async releaseLock(): Promise<void> {
      // No-op: see acquireLock.
    },

    async readDecisions(): Promise<DecisionsFile> {
      return { decisions: {} };
    },

    async readSnapshot(): Promise<AdsSnapshot> {
      const snapshot = emptySnapshot();
      try {
        const crs = (await api("GET", "/api/v1/change-requests")) as any;
        const list = Array.isArray(crs) ? crs : crs?.items || [];
        const adjustments = list.map(crToAdjustment);
        snapshot.source = "busabase";
        snapshot.generated_at = new Date().toISOString();
        snapshot.adjustments = adjustments;
        snapshot.metrics = {
          ...snapshot.metrics,
          ...countStatuses(adjustments),
          adjustments_needing_review: adjustments.filter((item) => item.status === "needs_review").length,
        };
        snapshot.warnings = [];
      } catch (error) {
        snapshot.warnings = [
          {
            id: "busabase-unreachable",
            severity: "warning",
            message: `Busabase unreachable: ${(error as Error).message}`,
          },
        ];
      }
      return snapshot;
    },

    async writeSnapshot(): Promise<void> {
      const error: HttpError = new Error(
        "Snapshot ingest / anomaly checks are local-only. Use KELLY_ADS_DATA_PROVIDER=local to ingest and check, then publish adjustments to Busabase.",
      );
      error.statusCode = 400;
      throw error;
    },

    async getState(): Promise<AdsState> {
      const configResult = await provider.readConfig();
      const [snapshot, onboarding] = await Promise.all([provider.readSnapshot(), provider.readOnboarding()]);
      return {
        app: "kelly-ads",
        data_provider: this.name,
        onboarding,
        lock: null,
        config_summary: summarizeConfig(configResult),
        snapshot,
      };
    },

    async applyDecision({
      adjustment_id,
      verdict,
      note,
    }: DecisionInput): Promise<{ adjustment: Adjustment; decision: AdjustmentDecision }> {
      if (!adjustment_id || typeof adjustment_id !== "string") throw new Error("adjustment_id is required");
      const cr = (await api("GET", `/api/v1/change-requests/${encodeURIComponent(adjustment_id)}`)) as Record<
        string,
        any
      >;
      const decidedAt = new Date().toISOString();
      const decision: AdjustmentDecision = {
        adjustment_id,
        verdict: (verdict || "note") as AdjustmentDecision["verdict"],
        note: typeof note === "string" ? note : "",
        decided_at: decidedAt,
      };
      if (verdict === "approve") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(adjustment_id)}/reviews`, {
          payload: { verdict: "approved", reason: note || undefined },
        });
      } else if (verdict === "request_changes") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(adjustment_id)}/reviews`, {
          payload: { verdict: "rejected", reason: note || "Please revise" },
        });
      } else if (verdict === "block") {
        await api("POST", `/api/v1/change-requests/${encodeURIComponent(adjustment_id)}/close`, {
          reason: note || "Closed by reviewer",
        });
      } else if (verdict !== "note") {
        const error: HttpError = new Error(`verdict must be one of: approve, request_changes, block, note`);
        error.statusCode = 400;
        throw error;
      }
      return { adjustment: crToAdjustment(cr), decision };
    },

    async verifyConnection(): Promise<Record<string, unknown>> {
      requireConfig();
      await api("GET", "/api/v1/change-requests");
      return { ok: true, base_url: baseUrl, base_id: baseId };
    },
  };

  return provider;
}
