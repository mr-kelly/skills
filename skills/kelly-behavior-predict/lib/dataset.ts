// Assembles the full deterministic dataset consumed by both the seed script
// and the server: per-segment sessions, funnel counts, prediction summaries,
// and backtest metrics, plus the overall aggregate. Pure module (no fs).

import { computeBacktest } from "./backtest.ts";
import { computeFunnelCounts } from "./funnel.ts";
import { SEGMENTS } from "./segments.ts";
import { DEFAULT_DATASET_SEED, generateAllSessions } from "./sessions.ts";
import { NEXT_ACTIONS } from "./types.ts";
import type {
  BacktestSummary,
  FunnelCounts,
  NextAction,
  RuleTrigger,
  SegmentPredictionSummary,
  SessionResult,
} from "./types.ts";

export interface SegmentDatasetEntry {
  segment_id: string;
  session_count: number;
  funnel: FunnelCounts;
  prediction_summary: SegmentPredictionSummary;
  backtest: BacktestSummary;
  sessions: SessionResult[];
}

export interface Dataset {
  schema_version: "1";
  seed: string;
  generated_at_note: string;
  overall_funnel: FunnelCounts;
  overall_backtest: BacktestSummary;
  segments: SegmentDatasetEntry[];
}

export function buildDataset(seed: string = DEFAULT_DATASET_SEED): Dataset {
  const allSessions = generateAllSessions(seed);

  const segments: SegmentDatasetEntry[] = SEGMENTS.map((segment) => {
    const sessions = allSessions.filter((s) => s.segment_id === segment.id);
    return {
      segment_id: segment.id,
      session_count: sessions.length,
      funnel: computeFunnelCounts(sessions, segment.id),
      prediction_summary: predictionSummary(segment.id, sessions),
      backtest: computeBacktest(sessions, segment.id),
      sessions,
    };
  });

  return {
    schema_version: "1",
    seed,
    generated_at_note:
      "Deterministic mock dataset — regenerate any time with scripts/generate_dataset.ts; output is byte-identical for the same seed.",
    overall_funnel: computeFunnelCounts(allSessions, "overall"),
    overall_backtest: computeBacktest(allSessions, "overall"),
    segments,
  };
}

function predictionSummary(segmentId: string, sessions: SessionResult[]): SegmentPredictionSummary {
  const action_distribution = Object.fromEntries(NEXT_ACTIONS.map((action) => [action, 0])) as Record<
    NextAction,
    number
  >;
  for (const s of sessions) action_distribution[s.predicted_action] += 1;
  const dominant_action = NEXT_ACTIONS.reduce((best, action) =>
    action_distribution[action] > action_distribution[best] ? action : best,
  );
  const sample_triggers: RuleTrigger[] = sessions.find((s) => s.predicted_action === dominant_action)?.triggers ?? [];
  return { segment_id: segmentId, dominant_action, action_distribution, sample_triggers };
}
