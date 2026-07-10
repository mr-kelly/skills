// Deterministic precision/recall-style backtest: compares each session's
// rule-based predicted_action against its mock actual_action and reports a
// confusion-matrix style summary per action, plus macro averages. Pure module.

import { NEXT_ACTIONS } from "./types.ts";
import type { BacktestSummary, ConfusionCell, NextAction, SessionResult } from "./types.ts";

export function computeBacktest(sessions: SessionResult[], segmentId: string | "overall" = "overall"): BacktestSummary {
  const total = sessions.length;
  const correct = sessions.filter((s) => s.predicted_action === s.actual_action).length;

  const per_action: ConfusionCell[] = NEXT_ACTIONS.map((action) => computeCell(sessions, action));

  const macro_precision = round3(average(per_action.map((c) => c.precision)));
  const macro_recall = round3(average(per_action.map((c) => c.recall)));
  const macro_f1 = round3(average(per_action.map((c) => c.f1)));

  return {
    segment_id: segmentId,
    total,
    correct,
    accuracy: total > 0 ? round3(correct / total) : 0,
    per_action,
    macro_precision,
    macro_recall,
    macro_f1,
  };
}

function computeCell(sessions: SessionResult[], action: NextAction): ConfusionCell {
  let true_positive = 0;
  let false_positive = 0;
  let false_negative = 0;
  let support = 0;
  for (const s of sessions) {
    const predicted = s.predicted_action === action;
    const actual = s.actual_action === action;
    if (actual) support += 1;
    if (predicted && actual) true_positive += 1;
    else if (predicted && !actual) false_positive += 1;
    else if (!predicted && actual) false_negative += 1;
  }
  const precision = true_positive + false_positive > 0 ? true_positive / (true_positive + false_positive) : 0;
  const recall = true_positive + false_negative > 0 ? true_positive / (true_positive + false_negative) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    action,
    true_positive,
    false_positive,
    false_negative,
    precision: round3(precision),
    recall: round3(recall),
    f1: round3(f1),
    support,
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
