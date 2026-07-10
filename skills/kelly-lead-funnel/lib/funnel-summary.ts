// Deterministic funnel summary: per-stage counts and conversion rates.
// Pure module, no fs/network.

import { type FunnelSummary, type Lead, STAGES, type StageSummary } from "./types.ts";

export function computeFunnelSummary(leads: Lead[]): FunnelSummary {
  const total = leads.length;
  const newCount = leads.filter((lead) => lead.stage === "new").length || 0;
  const counts = new Map<string, number>();
  for (const stage of STAGES) counts.set(stage, 0);
  for (const lead of leads) counts.set(lead.stage, (counts.get(lead.stage) || 0) + 1);

  const by_stage: StageSummary[] = STAGES.map((stage) => {
    const count = counts.get(stage) || 0;
    // Conversion is "reached this stage or further" relative to New, so it
    // reads as a funnel drop-off rather than a point-in-time snapshot count.
    const reached = leads.filter((lead) => hasReachedStage(lead, stage)).length;
    return {
      stage,
      count,
      conversion_from_new_pct: total ? round1((reached / total) * 100) : 0,
    };
  });

  const termSheetReady = counts.get("term_sheet_ready") || 0;
  const rejected = counts.get("rejected") || 0;
  return {
    total,
    by_stage,
    overall_conversion_pct: total ? round1((termSheetReady / total) * 100) : 0,
    rejection_rate_pct: total ? round1((rejected / total) * 100) : 0,
  };
}

function hasReachedStage(lead: Lead, stage: string): boolean {
  if (stage === "new") return true;
  if (stage === "rejected") return lead.stage === "rejected";
  return (lead.stage_history || []).some((change) => change.to === stage) || lead.stage === stage;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
