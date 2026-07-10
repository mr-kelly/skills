// Re-exports of the shared domain types plus a couple of server-only shapes
// (config summary). Keep dataset/decision shapes defined once in lib/types.ts
// and lib/dataset.ts so scripts, lib/, and the server never drift apart.

export type {
  BacktestSummary,
  ConfusionCell,
  Decision,
  DecisionsFile,
  DecisionStatus,
  FunnelCounts,
  FunnelStage,
  NextAction,
  OnboardingState,
  Prediction,
  RuleTrigger,
  SegmentDefinition,
  SegmentPredictionSummary,
  SessionFeatures,
  SessionResult,
} from "../../lib/types.ts";
export type { Dataset, SegmentDatasetEntry } from "../../lib/dataset.ts";

export interface ConfigSummary {
  config_path: string;
  is_example: boolean;
  data_provider: string;
  product_name: string;
  vertical: string;
  target_precision: number;
}
