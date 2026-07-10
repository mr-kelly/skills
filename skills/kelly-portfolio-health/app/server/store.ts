import { getProvider } from "../../lib/data-provider/index.ts";
import type { Config, ConfigResult } from "../../lib/data-provider/provider-interface.ts";
import { DEFAULT_RISK_POLICY, computeInsights } from "./insights.ts";
import type { ConfigSummary, PortfolioSnapshot } from "./types.ts";

export function emptySnapshot(): PortfolioSnapshot {
  return {
    schema_version: "1",
    snapshot_id: "",
    generated_at: new Date(0).toISOString(),
    source: "kelly-portfolio-health",
    base_currency: "USD",
    fund_name: "",
    contracts: [],
  };
}

export function riskPolicyFromConfig(config: Config | undefined) {
  const policy = config?.risk_policy || {};
  return {
    lag_watch_pp: Number(policy.lag_watch_pp ?? DEFAULT_RISK_POLICY.lag_watch_pp),
    lag_high_pp: Number(policy.lag_high_pp ?? DEFAULT_RISK_POLICY.lag_high_pp),
    revenue_decline_pct: Number(policy.revenue_decline_pct ?? DEFAULT_RISK_POLICY.revenue_decline_pct),
  };
}

// Attach deterministic, read-only insights to a snapshot for the /api/state
// payload. Pure with respect to storage — only computes from snapshot + config.
export function attachInsights(snapshot: PortfolioSnapshot, configResult: ConfigResult): PortfolioSnapshot {
  if (!snapshot) return snapshot;
  snapshot.insights = computeInsights(snapshot.contracts || [], riskPolicyFromConfig(configResult.config));
  return snapshot;
}

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config = configResult.config || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    base_currency: config.base_currency || "USD",
    fund_name: (config.fund_name as string) || "Sample RBF Fund",
    risk_policy: riskPolicyFromConfig(config),
  };
}

export async function loadState(): Promise<Record<string, unknown>> {
  const provider = getProvider();
  const [snapshotRaw, onboarding, lock, configResult, decisions] = await Promise.all([
    provider.readSnapshot<PortfolioSnapshot>(),
    provider.readOnboarding(),
    provider.readLock(),
    provider.readConfig(),
    provider.readDecisions(),
  ]);
  const snapshot = snapshotRaw || emptySnapshot();
  attachInsights(snapshot, configResult);
  return {
    app: "kelly-portfolio-health",
    data_provider: process.env.KELLY_PORTFOLIO_HEALTH_DATA_PROVIDER || configResult.config.data_provider || "local",
    onboarding,
    lock,
    decisions,
    config_summary: summarizeConfig(configResult),
    snapshot,
  };
}
