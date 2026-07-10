#!/usr/bin/env node
// Seeds the deterministic mock dataset (funnel + segments + backtest sample)
// to app/.data/dataset.json, and ensures an empty decisions.json handoff file
// exists. Re-running with the same seed produces byte-identical output.

import { ensureDirs, writeJson } from "../lib/common.ts";
import { readJson } from "../lib/common.ts";
import { type Dataset, buildDataset } from "../lib/dataset.ts";
import { DATASET_PATH, DECISIONS_PATH } from "../lib/paths.ts";
import { DEFAULT_DATASET_SEED } from "../lib/sessions.ts";
import type { DecisionsFile } from "../lib/types.ts";

const seed = process.argv[2] || DEFAULT_DATASET_SEED;

await ensureDirs();

const dataset: Dataset = buildDataset(seed);
await writeJson(DATASET_PATH, dataset);
console.log(`Wrote ${DATASET_PATH} (seed="${seed}", ${dataset.segments.length} segments)`);

const existingDecisions = await readJson<DecisionsFile>(DECISIONS_PATH, null);
if (!existingDecisions) {
  await writeJson(DECISIONS_PATH, {});
  console.log(`Wrote ${DECISIONS_PATH} (empty)`);
}
