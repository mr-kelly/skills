import { getProvider } from "../../lib/data-provider/index.ts";
import { computeFunnelSummary } from "../../lib/funnel-summary.ts";
import { DEFAULT_SCORING_CRITERIA } from "../../lib/scoring.ts";
import type { Config, ConfigResult, ConfigSummary } from "../../lib/types.ts";
export { ensureDirs, loadDotenvFiles } from "../../lib/common.ts";
export { envSearchPaths } from "../../lib/common.ts";

export function summarizeConfig(configResult: ConfigResult): ConfigSummary {
  const config: Config = configResult.config || {};
  return {
    config_path: configResult.path,
    is_example: configResult.is_example,
    base_currency: config.base_currency || "USD",
    fund_profile: config.fund_profile || {},
    scoring_criteria: { ...DEFAULT_SCORING_CRITERIA, ...(config.scoring_criteria || {}) },
  };
}

export async function buildState(): Promise<Record<string, unknown>> {
  const provider = getProvider();
  const [leads, onboarding, lock, configResult] = await Promise.all([
    provider.getLeads(),
    provider.getOnboarding(),
    provider.getLock(),
    provider.getConfig(),
  ]);
  return {
    app: "kelly-lead-funnel",
    data_provider: process.env.KELLY_LEAD_FUNNEL_DATA_PROVIDER || configResult.config.data_provider || provider.name,
    onboarding,
    lock,
    config_summary: summarizeConfig(configResult),
    leads,
    summary: computeFunnelSummary(leads),
  };
}
