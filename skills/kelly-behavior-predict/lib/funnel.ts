// Deterministic funnel aggregation: for a set of sessions, how many reached
// each stage, and what's the stage-to-stage drop-off percentage. Pure module.

import { FUNNEL_STAGES } from "./types.ts";
import type { FunnelCounts, FunnelStage, SessionResult } from "./types.ts";

export function computeFunnelCounts(
  sessions: SessionResult[],
  segmentId: string | "overall" = "overall",
): FunnelCounts {
  const stageOrder: FunnelStage[] = FUNNEL_STAGES;
  const stageIndex: Record<FunnelStage, number> = Object.fromEntries(
    stageOrder.map((stage, index) => [stage, index]),
  ) as Record<FunnelStage, number>;

  const stage_counts = Object.fromEntries(stageOrder.map((stage) => [stage, 0])) as Record<FunnelStage, number>;
  for (const session of sessions) {
    const reachedIndex = stageIndex[session.reached_stage];
    for (let i = 0; i <= reachedIndex; i += 1) {
      stage_counts[stageOrder[i]] += 1;
    }
  }

  const drop_off_pct: Partial<Record<FunnelStage, number>> = {};
  for (let i = 1; i < stageOrder.length; i += 1) {
    const prevCount = stage_counts[stageOrder[i - 1]];
    const currCount = stage_counts[stageOrder[i]];
    drop_off_pct[stageOrder[i]] = prevCount > 0 ? round1(((prevCount - currCount) / prevCount) * 100) : 0;
  }

  return { segment_id: segmentId, stage_counts, drop_off_pct };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
