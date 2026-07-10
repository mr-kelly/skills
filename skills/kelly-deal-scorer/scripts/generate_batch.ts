#!/usr/bin/env node
import type { Batch, Candidate } from "../app/server/types.ts";
// Thin CLI: build app/.data/current_batch.json from the mock candidate seeds,
// scoring each with lib/scoring.ts. Re-run any time to reset the demo queue.
import { withLock, writeJson } from "../lib/common.ts";
import { CANDIDATE_SEEDS } from "../lib/demo-candidates.ts";
import { BATCH_PATH } from "../lib/paths.ts";
import { DEFAULT_RUBRIC, computeScore } from "../lib/scoring.ts";

const now = new Date().toISOString();

function buildBatch(): Batch {
  const items: Candidate[] = CANDIDATE_SEEDS.map((seed) => {
    const score = computeScore(seed, DEFAULT_RUBRIC);
    return {
      id: seed.id,
      business_name: seed.business_name,
      category: seed.category,
      city: seed.city,
      requested_principal: seed.requested_principal,
      monthly_revenue: seed.monthly_revenue,
      red_flags: seed.red_flags,
      status: "needs_review",
      score,
    };
  });

  const scores = items.map((item) => item.score.composite_score);
  const high = scores.filter((s) => s >= DEFAULT_RUBRIC.decision_thresholds.high_confidence_min).length;
  const low = scores.filter((s) => s < DEFAULT_RUBRIC.decision_thresholds.needs_review_min).length;
  const review = items.length - high - low;

  return {
    batch_id: `kelly-deal-scorer-${now.replace(/[-:]/g, "").slice(0, 15)}`,
    generated_at: now,
    source: "kelly-deal-scorer",
    mode: "app-in-skill",
    metrics: { needs_review: items.length, approved: 0, done: 0, blocked: 0 },
    distribution: {
      high_confidence: high,
      needs_review: review,
      low_confidence: low,
      average_score: Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10,
    },
    items,
  };
}

await withLock("kelly-deal-scorer", "Generating deal review batch", async () => {
  const batch = buildBatch();
  await writeJson(BATCH_PATH, batch);
  console.log(`Wrote ${BATCH_PATH} with ${batch.items.length} candidates.`);
});
