import { ensureDirs } from "../../lib/common.ts";
import { getProvider } from "../../lib/data-provider/index.ts";
import type { ConfigSummary, Dataset, Decision, DecisionStatus, DecisionsFile, OnboardingState } from "./types.ts";

// Thin glue between the Hono routes and the data provider. Handlers must
// reach handoff files/config only through this module (backed by
// lib/data-provider/), never node:fs directly — this keeps the Hono app
// platform-neutral (see lib/data-provider/local-file-provider.ts).

export { ensureDirs };

export async function readDataset(): Promise<Dataset> {
  return getProvider().getDataset();
}

export async function readDecisions(): Promise<DecisionsFile> {
  return getProvider().getDecisions();
}

export async function readDecision(segmentId: string): Promise<Decision | null> {
  const decisions = await readDecisions();
  return decisions[segmentId] || null;
}

export async function writeDecision(segmentId: string, status: DecisionStatus, note: string): Promise<Decision> {
  const decision: Decision = {
    status,
    note: String(note || "").slice(0, 2000),
    decided_at: new Date().toISOString(),
  };
  const decisions = await getProvider().saveDecision(segmentId, decision);
  return decisions[segmentId];
}

export async function readOnboarding(): Promise<OnboardingState> {
  return getProvider().getOnboarding();
}

export async function readLock(): Promise<unknown> {
  return getProvider().getLock();
}

export async function summarizeConfig(): Promise<ConfigSummary> {
  const provider = getProvider();
  const config = await provider.getConfig();
  const product = (config.product_profile as Record<string, unknown>) || {};
  return {
    config_path: "config.local.json (or config.example.json template)",
    is_example: !("product_profile" in config),
    data_provider: provider.name,
    product_name: String(product.product_name || "Example Booking Co."),
    vertical: String(product.vertical || "consumer travel/booking"),
    target_precision: Number(config.target_precision ?? 0.6),
  };
}
